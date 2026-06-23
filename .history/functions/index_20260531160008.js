/**
 * ZetSpace Newsletter Cloud Functions
 * 
 * Trigger: When a NEW product is created in the "products" collection,
 * this function sends an email notification to all newsletter subscribers.
 * 
 * Uses: SendGrid for email delivery
 * 
 * To deploy:
 *   1. Set SendGrid API key: firebase functions:config:set sendgrid.api_key="YOUR_SENDGRID_API_KEY"
 *   2. Set sender email: firebase functions:config:set sendgrid.from_email="noreply@zetspace.dz"
 *   3. npm install
 *   4. firebase deploy --only functions
 */

const functions = require("firebase-functions");
const admin = require("firebase-admin");
const sgMail = require("@sendgrid/mail");

admin.initializeApp();

// Configure SendGrid with API key from Firebase config
const SENDGRID_API_KEY = functions.config().sendgrid?.api_key;
const FROM_EMAIL = functions.config().sendgrid?.from_email || "noreply@zetspace.dz";
const STORE_NAME = "ZetSpace";
const STORE_URL = "https://3drip.dz";

if (SENDGRID_API_KEY) {
  sgMail.setApiKey(SENDGRID_API_KEY);
}

/**
 * Cloud Function: onNewProduct
 * 
 * Triggered when a document is created in the "products" collection.
 * Fetches all newsletter subscribers and sends them an email notification
 * with the new product details.
 */
exports.onNewProduct = functions.firestore
  .document("products/{productId}")
  .onCreate(async (snap, context) => {
    const product = snap.data();
    const productId = context.params.productId;

    console.log(`[NEWSLETTER] New product created: ${product.name} (${productId})`);

    // If SendGrid is not configured, log and exit
    if (!SENDGRID_API_KEY) {
      console.log("[NEWSLETTER] SendGrid API key not configured. Skipping email notification.");
      console.log("[NEWSLETTER] To configure: firebase functions:config:set sendgrid.api_key=\"YOUR_KEY\"");
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
              <p>${STORE_NAME} — Built for those who refuse to stay in the shadows.</p>
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

      // Send emails in batches of 100 (SendGrid max per send)
      const BATCH_SIZE = 100;
      let sentCount = 0;
      let errorCount = 0;

      for (let i = 0; i < subscribers.length; i += BATCH_SIZE) {
        const batch = subscribers.slice(i, i + BATCH_SIZE);
        
        const msg = {
          to: batch,
          from: FROM_EMAIL,
          subject: `New Product Available at ${STORE_NAME}`,
          text: emailText,
          html: emailHtml,
        };

        try {
          await sgMail.sendMultiple(msg);
          sentCount += batch.length;
          console.log(`[NEWSLETTER] Batch sent: ${batch.length} emails`);
        } catch (batchError) {
          errorCount += batch.length;
          console.error(`[NEWSLETTER] Batch send error:`, batchError);
          if (batchError.response) {
            console.error(`[NEWSLETTER] SendGrid response:`, batchError.response.body);
          }
        }

        // Small delay between batches to avoid rate limits
        if (i + BATCH_SIZE < subscribers.length) {
          await new Promise((resolve) => setTimeout(resolve, 1000));
        }
      }

      console.log(`[NEWSLETTER] Complete: ${sentCount} sent, ${errorCount} failed out of ${subscribers.length} subscribers`);

      // Log the notification event
      await admin.firestore().collection("logs").add({
        productName: productName,
        price: product.price || 0,
        type: "NEWSLETTER_NOTIFICATION",
        status: "SENT",
        recipients: sentCount,
        errors: errorCount,
