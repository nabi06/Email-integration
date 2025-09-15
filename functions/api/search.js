// Cloudflare Pages Function with full email integration, authentication, and payment
export async function onRequest(context) {
  const cors = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Allow-Methods": "POST, OPTIONS"
  };

  if (context.request.method === "OPTIONS") {
    return new Response("", { headers: cors });
  }

  if (context.request.method !== "POST") {
    return new Response(JSON.stringify({ error: "Use POST method" }), {
      status: 405, headers: { ...cors, "Content-Type": "application/json" }
    });
  }

  try {
    const body = await context.request.json();
    const { action, email, password, criteria } = body;

    switch (action) {
      case 'register':
        return await handleRegister(context, email, password, cors);
      case 'login':
        return await handleLogin(context, email, password, cors);
      case 'search':
        return await handleSearch(context, email, criteria, cors);
      case 'upgrade':
        return await handleUpgrade(context, email, cors);
      case 'reset':
        return await handleReset(context, email, cors);
      default:
        return new Response(JSON.stringify({ error: "Invalid action" }), {
          status: 400, headers: { ...cors, "Content-Type": "application/json" }
        });
    }
  } catch (error) {
    console.error('API Error:', error);
    return new Response(JSON.stringify({ error: "Internal server error" }), {
      status: 500, headers: { ...cors, "Content-Type": "application/json" }
    });
  }
}

// Password hashing using Web Crypto API
async function hashPassword(password) {
  const encoder = new TextEncoder();
  const data = encoder.encode(password);
  const hash = await crypto.subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(hash)).map(b => b.toString(16).padStart(2, '0')).join('');
}

async function verifyPassword(password, hash) {
  const hashedPassword = await hashPassword(password);
  return hashedPassword === hash;
}

// Registration handler
async function handleRegister(context, email, password, cors) {
  if (!email || !password) {
    return new Response(JSON.stringify({ error: "Email and password required" }), {
      status: 400, headers: { ...cors, "Content-Type": "application/json" }
    });
  }

  try {
    // Check if user already exists
    const existingUser = await context.env.USERS_KV.get(email);
    if (existingUser) {
      return new Response(JSON.stringify({ error: "User already exists" }), {
        status: 400, headers: { ...cors, "Content-Type": "application/json" }
      });
    }

    // Create new user
    const hashedPassword = await hashPassword(password);
    const userData = {
      email: email,
      password_hash: hashedPassword,
      subscription_status: 'free',
      monthly_searches: 0,
      created_at: new Date().toISOString(),
      last_reset: new Date().toISOString()
    };

    await context.env.USERS_KV.put(email, JSON.stringify(userData));

    // Return user data without password hash
    const { password_hash, ...safeUserData } = userData;
    return new Response(JSON.stringify({ 
      success: true, 
      message: "Registration successful",
      user: safeUserData 
    }), {
      status: 200, headers: { ...cors, "Content-Type": "application/json" }
    });
  } catch (error) {
    console.error('Registration error:', error);
    return new Response(JSON.stringify({ error: "Registration failed" }), {
      status: 500, headers: { ...cors, "Content-Type": "application/json" }
    });
  }
}

// Login handler
async function handleLogin(context, email, password, cors) {
  if (!email || !password) {
    return new Response(JSON.stringify({ error: "Email and password required" }), {
      status: 400, headers: { ...cors, "Content-Type": "application/json" }
    });
  }

  try {
    const userDataString = await context.env.USERS_KV.get(email);
    if (!userDataString) {
      return new Response(JSON.stringify({ error: "Invalid credentials" }), {
        status: 401, headers: { ...cors, "Content-Type": "application/json" }
      });
    }

    const userData = JSON.parse(userDataString);
    const isValidPassword = await verifyPassword(password, userData.password_hash);
    
    if (!isValidPassword) {
      return new Response(JSON.stringify({ error: "Invalid credentials" }), {
        status: 401, headers: { ...cors, "Content-Type": "application/json" }
      });
    }

    // Reset monthly searches if it's a new month
    const now = new Date();
    const lastReset = new Date(userData.last_reset || userData.created_at);
    if (now.getMonth() !== lastReset.getMonth() || now.getFullYear() !== lastReset.getFullYear()) {
      userData.monthly_searches = 0;
      userData.last_reset = now.toISOString();
      await context.env.USERS_KV.put(email, JSON.stringify(userData));
    }

    // Return user data without password hash
    const { password_hash, ...safeUserData } = userData;
    return new Response(JSON.stringify({ 
      success: true, 
      message: "Login successful",
      user: safeUserData 
    }), {
      status: 200, headers: { ...cors, "Content-Type": "application/json" }
    });
  } catch (error) {
    console.error('Login error:', error);
    return new Response(JSON.stringify({ error: "Login failed" }), {
      status: 500, headers: { ...cors, "Content-Type": "application/json" }
    });
  }
}

// Search handler with email delivery
async function handleSearch(context, email, criteria, cors) {
  if (!email || !criteria) {
    return new Response(JSON.stringify({ error: "Email and search criteria required" }), {
      status: 400, headers: { ...cors, "Content-Type": "application/json" }
    });
  }

  try {
    // Get user data
    const userDataString = await context.env.USERS_KV.get(email);
    if (!userDataString) {
      return new Response(JSON.stringify({ error: "User not found" }), {
        status: 404, headers: { ...cors, "Content-Type": "application/json" }
      });
    }

    const userData = JSON.parse(userDataString);
    const isFreeTier = userData.subscription_status !== 'active';
    const maxSearches = isFreeTier ? 5 : 15;  // Free: 5 searches, Pro: 15 searches
    const maxAbstracts = isFreeTier ? 3 : 10; // Free: 3 abstracts, Pro: 10 abstracts

    // Check search limits
    if (userData.monthly_searches >= maxSearches) {
      return new Response(JSON.stringify({ 
        error: `Search limit reached. ${isFreeTier ? 'Free users get 5 searches/month' : 'Pro users get 15 searches/month'}. Upgrade for more!` 
      }), {
        status: 429, headers: { ...cors, "Content-Type": "application/json" }
      });
    }

    // Prepare search criteria for NIH API
    const searchCriteria = { ...criteria };
    if (searchCriteria.text_search) {
      searchCriteria.advanced_text_search = {
        operator: "and",
        search_field: "projecttitle,terms,abstracttext",
        search_text: String(searchCriteria.text_search)
      };
      delete searchCriteria.text_search;
    }

    // Search NIH API
    const nihPayload = {
      criteria: searchCriteria,
      sort_field: "project_start_date",
      sort_order: "desc",
      offset: 0,
      limit: maxAbstracts
    };

    const nihResponse = await fetch("https://api.reporter.nih.gov/v2/projects/search", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(nihPayload)
    });

    if (!nihResponse.ok) {
      throw new Error(`NIH API error: ${nihResponse.status}`);
    }

    const nihData = await nihResponse.json();
    const projects = nihData.results || [];

    // Update user search count
    userData.monthly_searches += 1;
    await context.env.USERS_KV.put(email, JSON.stringify(userData));

    // Send results via email
    const emailSent = await sendSearchResultsEmail(context, email, projects, searchCriteria);
    
    if (!emailSent) {
      // Still return success but with a warning about email
      const { password_hash, ...safeUserData } = userData;
      return new Response(JSON.stringify({ 
        success: true, 
        message: `Search completed! ${projects.length} results found (email delivery failed - please check your email configuration)`,
        user: safeUserData,
        results_count: projects.length,
        warning: "Email delivery failed"
      }), {
        status: 200, headers: { ...cors, "Content-Type": "application/json" }
      });
    }

    // Return success response
    const { password_hash, ...safeUserData } = userData;
    return new Response(JSON.stringify({ 
      success: true, 
      message: `Search completed! ${projects.length} results sent to your email`,
      user: safeUserData,
      results_count: projects.length
    }), {
      status: 200, headers: { ...cors, "Content-Type": "application/json" }
    });

  } catch (error) {
    console.error('Search error:', error);
    return new Response(JSON.stringify({ error: "Search failed: " + error.message }), {
      status: 500, headers: { ...cors, "Content-Type": "application/json" }
    });
  }
}

// Email sending function using Brevo
async function sendSearchResultsEmail(context, email, projects, criteria) {
  try {
    const brevoApiKey = context.env.BREVO_API_KEY;
    const senderEmail = context.env.SENDER_EMAIL;
    
    if (!brevoApiKey || !senderEmail) {
      console.error('Missing email configuration');
      return false;
    }

    // Test Brevo API key first
    const testResponse = await fetch('https://api.brevo.com/v3/account', {
      headers: { 'api-key': brevoApiKey }
    });
    
    if (!testResponse.ok) {
      console.error('Brevo API key invalid or expired');
      return false;
    }

    // Format search results for email
    let emailContent = `
      <h2>🔬 Your NIH RePORTER Search Results</h2>
      <p><strong>Search criteria:</strong> ${JSON.stringify(criteria, null, 2)}</p>
      <p><strong>Results found:</strong> ${projects.length}</p>
      <hr>
    `;

    projects.forEach((project, index) => {
      emailContent += `
        <div style="margin-bottom: 30px; border-left: 4px solid #007bff; padding-left: 15px;">
          <h3>${index + 1}. ${project.project_title || 'No title available'}</h3>
          <p><strong>PI:</strong> ${project.principal_investigators?.[0]?.full_name || 'Not specified'}</p>
          <p><strong>Institution:</strong> ${project.principal_investigators?.[0]?.org_name || 'Not specified'}</p>
          <p><strong>Award:</strong> ${project.award_amount ? '$' + project.award_amount.toLocaleString() : 'Not specified'}</p>
          <p><strong>Fiscal Year:</strong> ${project.fy || 'Not specified'}</p>
          <p><strong>Abstract:</strong></p>
          <p style="background: #f8f9fa; padding: 15px; border-radius: 5px;">
            ${project.abstract_text || 'No abstract available'}
          </p>
        </div>
      `;
    });

    emailContent += `
      <hr>
      <p style="color: #666; font-size: 14px;">
        <em>Powered by NIH RePORTER Scoop - Your AI research discovery tool</em>
      </p>
    `;

    const emailPayload = {
      sender: { email: senderEmail, name: "NIH RePORTER Scoop" },
      to: [{ email: email }],
      subject: `🔬 Your NIH Research Results (${projects.length} projects found)`,
      htmlContent: emailContent
    };

    const emailResponse = await fetch('https://api.brevo.com/v3/smtp/email', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'api-key': brevoApiKey
      },
      body: JSON.stringify(emailPayload)
    });

    if (!emailResponse.ok) {
      const errorText = await emailResponse.text();
      console.error('Email sending failed:', emailResponse.status, errorText);
      throw new Error(`Email sending failed: ${emailResponse.status} - ${errorText}`);
    }

    return true;
  } catch (error) {
    console.error('Email error:', error);
    return false;
  }
}

// Stripe subscription upgrade handler
async function handleUpgrade(context, email, cors) {
  try {
    const stripeSecretKey = context.env.STRIPE_SECRET_KEY;
    const stripePriceId = context.env.STRIPE_PRICE_ID;
    
    if (!stripeSecretKey || !stripePriceId) {
      return new Response(JSON.stringify({ error: "Payment configuration missing" }), {
        status: 500, headers: { ...cors, "Content-Type": "application/json" }
      });
    }

    // Create Stripe checkout session with proper URL encoding
    const params = new URLSearchParams();
    params.append('payment_method_types[]', 'card');
    params.append('mode', 'subscription');
    params.append('line_items[0][price]', stripePriceId);
    params.append('line_items[0][quantity]', '1');
    params.append('customer_email', email);
    params.append('success_url', 'http://localhost:8788/?success=true');
    params.append('cancel_url', 'http://localhost:8788/?cancelled=true');
    params.append('metadata[user_email]', email);

    const stripeResponse = await fetch('https://api.stripe.com/v1/checkout/sessions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${stripeSecretKey}`,
        'Content-Type': 'application/x-www-form-urlencoded'
      },
      body: params.toString()
    });

    if (!stripeResponse.ok) {
      const errorText = await stripeResponse.text();
      console.error('Stripe error:', errorText);
      throw new Error('Payment session creation failed');
    }

    const stripeData = await stripeResponse.json();
    
    return new Response(JSON.stringify({ 
      success: true, 
      checkout_url: stripeData.url 
    }), {
      status: 200, headers: { ...cors, "Content-Type": "application/json" }
    });

  } catch (error) {
    console.error('Upgrade error:', error);
    return new Response(JSON.stringify({ error: "Upgrade failed: " + error.message }), {
      status: 500, headers: { ...cors, "Content-Type": "application/json" }
    });
  }
}

// Reset search counter for testing
async function handleReset(context, email, cors) {
  try {
    const userDataString = await context.env.USERS_KV.get(email);
    if (!userDataString) {
      return new Response(JSON.stringify({ error: "User not found" }), {
        status: 404, headers: { ...cors, "Content-Type": "application/json" }
      });
    }

    const userData = JSON.parse(userDataString);
    userData.monthly_searches = 0;
    userData.last_reset = new Date().toISOString();
    
    await context.env.USERS_KV.put(email, JSON.stringify(userData));

    const { password_hash, ...safeUserData } = userData;
    return new Response(JSON.stringify({ 
      success: true, 
      message: "Search counter reset successfully",
      user: safeUserData 
    }), {
      status: 200, headers: { ...cors, "Content-Type": "application/json" }
    });
  } catch (error) {
    console.error('Reset error:', error);
    return new Response(JSON.stringify({ error: "Reset failed" }), {
      status: 500, headers: { ...cors, "Content-Type": "application/json" }
    });
  }
}