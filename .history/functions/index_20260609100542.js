/**
 * JWS CLOTHING DZ Newsletter Cloud Functions
 * 
 * Trigger: When a NEW product is created in the "products" collection,
 * this function sends an email notification to all newsletter subscribers.
 * 
 * Uses: Resend for email delivery
 * 
 * To deploy:
 *   1. Set Resend API key: firebase functions:config:set resend.api_key="re_YOUR_RESEND_API_KEY"
 *   2. Set sender email: firebase functions:config:set resend.from_email="noreply@jwsclothingdz.com"
 *   3. npm install
 *   4. firebase deploy --only functions
 */

const functions = require("firebase-functions");
const admin = require("firebase-admin");
const { Resend } = require("resend");

admin.initializeApp();

// Configure Resend with API key from Firebase config
const RESEND_API_KEY = functions.config().resend?.api_key;
const FROM_EMAIL = functions.config().resend?.from_email || "noreply@jwsclothingdz.com";
const STORE_NAME = "JWS CLOTHING DZ";
const STORE_URL = "https://jwsclothingdz.com";

let resend = null;
if (RESEND_API_KEY) {
  resend = new Resend(RESEND_API_KEY);
}

/**
 * Cloud Function: onNewProduct
 * 
 * Triggered when a document is created in the "products" collection.
 * Fetches all newsletter subscribers and sends them an email notification
 * with the new product details.
 * 
 * Deduplication: Checks the `notificationSent` field on the product document.
 * If already true, the function exits early to prevent duplicate sends.
 * After successful send, sets `notificationSent` to true.
 */
exports.onNewProduct = functions.firestore
  .document("products/{productId}")
  .onCreate(async (snap, context) => {
    const product = snap.data();
    const productId = context.params.productId;

    console.log(`[NEWSLETTER] New product created: ${product.name} (${productId})`);

    // If Resend is not configured, log and exit
    if (!RESEND_API_KEY || !resend) {
      console.log("[NEWSLETTER] Resend API key not configured. Skipping email notification.");
      console.log("[NEWSLETTER] To configure: firebase functions:config:set resend.api_key=\"re_YOUR_KEY\"");
      return null;
    }

    // Deduplication: check if notification already sent for this product
    if (product.notificationSent === true) {
      console.log(`[NEWSLETTER] Notification already sent for product ${productId}. Skipping.`);
      return null;
    }

    try {
      // Fetch all subscribers
      const subscribersSnapshot = await admin
        .firestore()
        .collection("newsletter_subscribers")
        .get();

      const subscribers = [];
      subscribersSnapshot.forEach((doc) => {
        const data = doc.data();
        if (data && data.email) {
          subscribers.push(data.email);
        }
      });

      console.log(`[NEWSLETTER] Found ${subscribers.length} subscribers to notify`);

      if (subscribers.length === 0) {
        console.log("[NEWSLETTER] No subscribers to notify.");
        // Mark as sent so we don't retry for zero subscribers
        await snap.ref.update({ notificationSent: true });
        return null;
      }

      // Build the product URL
      const productUrl = `${STORE_URL}/#product/${productId}`;

      // Build the email HTML content
      const productImage = product.img || "";
      const productPrice = product.price 
        ? `${Number(product.price).toLocaleString()} DZD` 
        : "View Product";
      const productName = product.name || "New Product";

      const emailHtml = `
        <!DOCTYPE html>
        <html>
        <head>
          <meta charset="utf-8">
          <style>
            body {
              font-family: 'Inter', 'Helvetica', 'Arial', sans-serif;
              margin: 0;
              padding: 0;
              background-color: #f6f6f6;
              color: #111;
            }
            .container {
              max-width: 600px;
              margin: 0 auto;
              background: #ffffff;
            }
            .header {
              background: #111;
              padding: 40px 30px;
              text-align: center;
            }
            .header h1 {
              color: #fff;
              font-size: 28px;
              font-weight: 700;
              letter-spacing: -1px;
              margin: 0;
              text-transform: uppercase;
            }
            .header .sub {
              color: rgba(255,255,255,0.5);
              font-size: 12px;
              letter-spacing: 3px;
              text-transform: uppercase;
              margin-top: 8px;
            }
            .content {
              padding: 40px 30px;
            }
            .content h2 {
              font-size: 22px;
              font-weight: 600;
              letter-spacing: -0.5px;
              margin-bottom: 20px;
              text-transform: uppercase;
            }
            .content p {
              font-size: 15px;
              line-height: 1.7;
              color: #666;
              margin-bottom: 25px;
            }
            .product-image {
              width: 100%;
              max-width: 400px;
              height: auto;
              margin: 0 auto 25px;
              display: block;
              background: #f0f0f0;
            }
            .product-details {
              text-align: center;
              margin-bottom: 30px;
            }
            .product-name {
              font-size: 20px;
              font-weight: 700;
              color: #111;
              margin-bottom: 8px;
              text-transform: uppercase;
            }
            .product-price {
              font-size: 24px;
              font-weight: 700;
              color: #111;
              margin-bottom: 25px;
            }
            .cta-button {
              display: inline-block;
              padding: 16px 40px;
              background: #111;
              color: #fff !important;
              text-decoration: none;
              font-size: 13px;
              font-weight: 600;
              letter-spacing: 2px;
              text-transform: uppercase;
              border-radius: 0;
            }
            .footer {
              padding: 30px;
              text-align: center;
              border-top: 1px solid #eaeaea;
            }
            .footer p {
              font-size: 12px;
              color: #999;
              margin: 5px 0;
            }
            .footer a {
              color: #111;
              text-decoration: none;
              font-weight: 600;
            }
            @media (max-width: 480px) {
              .content { padding: 30px 20px; }
              .header { padding: 30px 20px; }
              .header h1 { font-size: 22px; }
            }
          </style>
        </head>
        <body>
          <div class="container">
            <div class="header">
              <h1>${STORE_NAME}</h1>
              <div class="sub">New Product Available</div>
            </div>
            <div class="content">
              <h2>New Drop Incoming</h2>
              <p>A new product has just been added to the ${STORE_NAME} collection. Be the first to secure your piece.</p>
              
              ${productImage ? `<img src="${productImage}" alt="${productName}" class="product-image">` : ""}
              
              <div class="product-details">
                <div class="product-name">${productName}</div>
                <div class="product-price">${productPrice}</div>
                <a href="${productUrl}" class="cta-button">View Product</a>
              </div>
            </div>
            <div class="footer">
              <p>You received this email because you subscribed to the ${STORE_NAME} newsletter.</p>
              <p>${STORE_NAME} â€” Built for those who refuse to stay in the shadows.</p>
              <p><a href="${STORE_URL}">${STORE_URL}</a></p>
            </div>
          </div>
        </body>
        </html>
      `;

      const emailText = `New Product Available at ${STORE_NAME}\n\n` +
        `A new product has just been added.\n\n` +
        `Product: ${productName}\n` +
        `Price: ${productPrice}\n\n` +
        `View Product: ${productUrl}\n\n` +
        `---\n${STORE_NAME}`;

      // Send emails in batches to avoid rate limits
      // Resend recommends a maximum of 50 recipients per send call
      const BATCH_SIZE = 50;
      let sentCount = 0;
      let errorCount = 0;

      for (let i = 0; i < subscribers.length; i += BATCH_SIZE) {
        const batch = subscribers.slice(i, i + BATCH_SIZE);

        try {
          const { data, error } = await resend.emails.send({
            from: FROM_EMAIL,
            to: batch,
            subject: `New Product Available at ${STORE_NAME}`,
            text: emailText,
            html: emailHtml,
          });

          if (error) {
            errorCount += batch.length;
            console.error(`[NEWSLETTER] Resend batch error for product ${productId}:`, error);
          } else {
            sentCount += batch.length;
            console.log(`[NEWSLETTER] Batch sent: ${batch.length} emails (Resend ID: ${data?.id})`);
          }
        } catch (batchError) {
          errorCount += batch.length;
          console.error(`[NEWSLETTER] Batch send exception for product ${productId}:`, batchError.message);
          if (batchError.response) {
            console.error(`[NEWSLETTER] Resend response:`, batchError.response);
          }
        }

        // Small delay between batches to avoid rate limits
        if (i + BATCH_SIZE < subscribers.length) {
          await new Promise((resolve) => setTimeout(resolve, 1000));
        }
      }

      // Mark notification as sent on the product document (deduplication)
      await snap.ref.update({ notificationSent: true });

      console.log(`[NEWSLETTER] Complete: ${sentCount} sent, ${errorCount} failed out of ${subscribers.length} subscribers for product ${productId}`);

      // Log the notification event
      await admin.firestore().collection("logs").add({
        productName: productName,
        productId: productId,
        price: product.price || 0,
        type: "NEWSLETTER_NOTIFICATION",
        status: errorCount > 0 && sentCount === 0 ? "PARTIAL_FAILURE" : "SENT",
        recipients: sentCount,
        errors: errorCount,
        timestamp: admin.firestore.FieldValue.serverTimestamp(),
      });

      return { sent: sentCount, errors: errorCount };
    } catch (error) {
      console.error(`[NEWSLETTER] Fatal error for product ${productId}:`, error.message);
      
      // Log the failure
      try {
        await admin.firestore().collection("logs").add({
          productName: product.name || "UNKNOWN",
          productId: productId,
          type: "NEWSLETTER_NOTIFICATION",
          status: "FAILED",
          error: error.message,
          timestamp: admin.firestore.FieldValue.serverTimestamp(),
        });
      } catch (logError) {
        console.error("[NEWSLETTER] Failed to log error:", logError.message);
      }

      return null;
    }
  });

/**
 * Helper function to validate email format
 */
function isValidEmail(email) {
  const re = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return re.test(email);
}
