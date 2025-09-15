// Stripe webhook handler for subscription updates
export async function onRequest(context) {
  const cors = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "Content-Type, Stripe-Signature",
    "Access-Control-Allow-Methods": "POST, OPTIONS"
  };

  if (context.request.method === "OPTIONS") {
    return new Response("", { headers: cors });
  }

  if (context.request.method !== "POST") {
    return new Response("Method not allowed", { status: 405, headers: cors });
  }

  try {
    const body = await context.request.text();
    const sig = context.request.headers.get('stripe-signature');
    
    // Parse the webhook payload
    const payload = JSON.parse(body);
    
    // Handle different event types
    switch (payload.type) {
      case 'checkout.session.completed':
        await handleCheckoutCompleted(context, payload.data.object);
        break;
      case 'invoice.payment_succeeded':
        await handlePaymentSucceeded(context, payload.data.object);
        break;
      case 'customer.subscription.deleted':
        await handleSubscriptionCancelled(context, payload.data.object);
        break;
      default:
        console.log(`Unhandled event type: ${payload.type}`);
    }

    return new Response(JSON.stringify({ received: true }), {
      status: 200,
      headers: { ...cors, "Content-Type": "application/json" }
    });

  } catch (error) {
    console.error('Webhook error:', error);
    return new Response(JSON.stringify({ error: 'Webhook failed' }), {
      status: 400,
      headers: { ...cors, "Content-Type": "application/json" }
    });
  }
}

async function handleCheckoutCompleted(context, session) {
  try {
    const customerEmail = session.customer_email || session.metadata?.user_email;
    
    if (!customerEmail) {
      console.error('No customer email found in checkout session');
      return;
    }

    // Get user data
    const userDataString = await context.env.USERS_KV.get(customerEmail);
    if (!userDataString) {
      console.error('User not found:', customerEmail);
      return;
    }

    const userData = JSON.parse(userDataString);
    
    // Update subscription status
    userData.subscription_status = 'active';
    userData.stripe_customer_id = session.customer;
    userData.subscription_id = session.subscription;
    userData.upgraded_at = new Date().toISOString();
    
    // Save updated user data
    await context.env.USERS_KV.put(customerEmail, JSON.stringify(userData));
    
    console.log('Subscription activated for:', customerEmail);
  } catch (error) {
    console.error('Error handling checkout completed:', error);
  }
}

async function handlePaymentSucceeded(context, invoice) {
  try {
    const subscription = invoice.subscription;
    const customerEmail = invoice.customer_email;
    
    if (!customerEmail) return;

    const userDataString = await context.env.USERS_KV.get(customerEmail);
    if (!userDataString) return;

    const userData = JSON.parse(userDataString);
    userData.subscription_status = 'active';
    userData.last_payment = new Date().toISOString();
    
    await context.env.USERS_KV.put(customerEmail, JSON.stringify(userData));
    
    console.log('Payment succeeded for:', customerEmail);
  } catch (error) {
    console.error('Error handling payment succeeded:', error);
  }
}

async function handleSubscriptionCancelled(context, subscription) {
  try {
    // Find user by subscription ID (you might need to implement a lookup)
    // For now, we'll handle this in the main app when users try to search
    console.log('Subscription cancelled:', subscription.id);
  } catch (error) {
    console.error('Error handling subscription cancelled:', error);
  }
}
