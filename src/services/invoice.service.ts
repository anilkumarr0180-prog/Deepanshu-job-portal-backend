import PaymentTransaction, { IPaymentTransaction } from "../models/payment-transaction.model";
import User from "../models/user.model";
import SubscriptionPlan from "../models/subscription-plan.model";

export async function generateInvoiceDetails(
  transactionId: string,
  requestingUserId?: string,
  requestingUserRole?: string
) {
  const transaction = await PaymentTransaction.findById(transactionId).populate("userId planId");
  if (!transaction) throw new Error("Transaction record not found");

  const user = transaction.userId as any;
  const plan = transaction.planId as any;

  if (requestingUserId) {
    const ownerId = user?._id ? user._id.toString() : transaction.userId?.toString();
    if (ownerId && ownerId !== requestingUserId.toString() && requestingUserRole !== "admin") {
      throw new Error("Forbidden: You do not have permission to view or download this invoice.");
    }
  }

  const invoiceNumber = `INV-${new Date().getFullYear()}-${transaction._id.toString().substring(18).toUpperCase()}`;

  return {
    invoiceNumber,
    date: transaction.createdAt,
    amount: transaction.amount,
    currency: transaction.currency || "INR",
    status: transaction.status,
    paymentMethod: transaction.paymentMethod,
    transactionId: transaction.transactionId || transaction.providerPaymentId || transaction._id.toString(),
    user: {
      name: user?.name || "Valued Customer",
      email: user?.email || "customer@example.com",
    },
    plan: {
      name: plan?.name || "JobsBox Subscription Plan",
      description: plan?.description || "Enterprise Tier Plan",
      billingPeriod: plan?.billingPeriod === "yearly" ? "Annual" : "Monthly",
    },
  };
}

export function generateInvoiceHTML(invoice: any): string {
  const isUSD = (invoice.currency || "").toUpperCase() === "USD";
  const symbol = isUSD ? "$" : "₹";
  const locale = isUSD ? "en-US" : "en-IN";
  const subtotal = Number((invoice.amount / 1.18).toFixed(2));
  const gst = Number((invoice.amount - subtotal).toFixed(2));

  return `
    <!DOCTYPE html>
    <html lang="en">
    <head>
      <meta charset="utf-8" />
      <meta name="viewport" content="width=device-width, initial-scale=1.0" />
      <title>Invoice ${invoice.invoiceNumber} - JobsBox</title>
      <style>
        * { box-sizing: border-box; margin: 0; padding: 0; }
        body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; background: #0b0f19; color: #1e293b; padding: 40px 20px; }
        .invoice-box { max-width: 800px; margin: auto; padding: 40px; background: #ffffff; border-radius: 24px; box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.25); border: 1px solid #e2e8f0; }
        .header { display: flex; justify-content: space-between; align-items: flex-start; border-bottom: 2px solid #f1f5f9; padding-bottom: 28px; margin-bottom: 28px; }
        .brand { display: flex; align-items: center; gap: 10px; }
        .brand-logo { width: 36px; height: 36px; background: linear-gradient(135deg, #4f46e5, #7c3aed); border-radius: 10px; display: inline-flex; align-items: center; justify-content: center; color: #fff; font-weight: 900; font-size: 20px; }
        .brand-name { font-size: 24px; font-weight: 900; color: #0f172a; letter-spacing: -0.5px; }
        .invoice-meta { text-align: right; }
        .invoice-title { font-size: 22px; font-weight: 800; color: #4f46e5; margin-bottom: 4px; }
        .invoice-id { font-size: 14px; font-weight: 700; color: #64748b; }
        .meta-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 24px; margin-bottom: 32px; background: #f8fafc; padding: 24px; border-radius: 16px; border: 1px solid #f1f5f9; }
        .meta-block h4 { font-size: 11px; text-transform: uppercase; letter-spacing: 1px; color: #94a3b8; margin-bottom: 8px; font-weight: 700; }
        .meta-block p { font-size: 14px; color: #0f172a; font-weight: 600; line-height: 1.5; }
        .status-badge { display: inline-block; background: #ecfdf5; color: #059669; border: 1px solid #a7f3d0; padding: 4px 10px; border-radius: 9999px; font-size: 11px; font-weight: 800; text-transform: uppercase; margin-top: 4px; }
        .table { width: 100%; border-collapse: collapse; margin-bottom: 28px; }
        .table th { background: #f1f5f9; padding: 14px 16px; text-align: left; font-size: 11px; text-transform: uppercase; letter-spacing: 0.5px; color: #475569; font-weight: 700; border-radius: 8px; }
        .table td { padding: 18px 16px; border-bottom: 1px solid #f1f5f9; font-size: 14px; color: #334155; }
        .totals-section { display: flex; justify-content: flex-end; margin-bottom: 36px; }
        .totals-box { width: 300px; }
        .totals-row { display: flex; justify-content: space-between; padding: 8px 0; font-size: 14px; color: #64748b; }
        .totals-row.final { border-top: 2px solid #e2e8f0; margin-top: 8px; padding-top: 14px; font-size: 18px; font-weight: 900; color: #4f46e5; }
        .footer-note { text-align: center; font-size: 12px; color: #94a3b8; border-top: 1px solid #f1f5f9; padding-top: 24px; }
        .action-bar { max-width: 800px; margin: 0 auto 20px; display: flex; justify-content: flex-end; gap: 12px; }
        .btn-print { background: linear-gradient(135deg, #4f46e5, #7c3aed); color: #fff; border: none; padding: 12px 24px; border-radius: 12px; font-size: 14px; font-weight: 700; cursor: pointer; box-shadow: 0 10px 15px -3px rgba(79, 70, 229, 0.3); transition: transform 0.1s; }
        .btn-print:hover { transform: scale(1.02); }
        @media print {
          body { background: #fff; padding: 0; }
          .invoice-box { box-shadow: none; border: none; padding: 0; }
          .action-bar { display: none; }
        }
      </style>
    </head>
    <body>
      <div class="action-bar">
        <button class="btn-print" onclick="window.print()">🖨️ Print / Download PDF</button>
      </div>

      <div class="invoice-box">
        <div class="header">
          <div class="brand">
            <div class="brand-logo">J</div>
            <div>
              <div class="brand-name">JobsBox</div>
              <p style="font-size: 12px; color: #64748b;">Enterprise Career & Hiring Engine</p>
            </div>
          </div>
          <div class="invoice-meta">
            <div class="invoice-title">TAX INVOICE</div>
            <div class="invoice-id">#${invoice.invoiceNumber}</div>
            <p style="font-size: 12px; color: #64748b; margin-top: 4px;">Date: ${new Date(invoice.date).toLocaleDateString(locale, { month: 'short', day: 'numeric', year: 'numeric' })}</p>
          </div>
        </div>

        <div class="meta-grid">
          <div class="meta-block">
            <h4>Billed To</h4>
            <p>${invoice.user.name}</p>
            <p style="color: #64748b; font-size: 13px;">${invoice.user.email}</p>
          </div>
          <div class="meta-block">
            <h4>Payment Information</h4>
            <p>Method: <span style="text-transform: capitalize;">${invoice.paymentMethod || 'Razorpay'}</span></p>
            <p style="font-size: 12px; color: #64748b; font-family: monospace;">Txn: ${invoice.transactionId}</p>
            <span class="status-badge">✓ ${invoice.status.toUpperCase()}</span>
          </div>
        </div>

        <table class="table">
          <thead>
            <tr>
              <th>Description</th>
              <th>Billing Interval</th>
              <th style="text-align: right;">Amount</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>
                <div style="font-weight: 700; color: #0f172a;">${invoice.plan.name}</div>
                <div style="font-size: 12px; color: #64748b; margin-top: 2px;">${invoice.plan.description}</div>
              </td>
              <td>${invoice.plan.billingPeriod}</td>
              <td style="text-align: right; font-weight: 700;">${symbol}${subtotal.toLocaleString(locale, { minimumFractionDigits: 2 })}</td>
            </tr>
          </tbody>
        </table>

        <div class="totals-section">
          <div class="totals-box">
            <div class="totals-row">
              <span>Subtotal</span>
              <span>${symbol}${subtotal.toLocaleString(locale, { minimumFractionDigits: 2 })}</span>
            </div>
            <div class="totals-row">
              <span>GST (18%)</span>
              <span>${symbol}${gst.toLocaleString(locale, { minimumFractionDigits: 2 })}</span>
            </div>
            <div class="totals-row final">
              <span>Total Paid</span>
              <span>${symbol}${Number(invoice.amount).toLocaleString(locale, { minimumFractionDigits: 2 })} ${invoice.currency}</span>
            </div>
          </div>
        </div>

        <div class="footer-note">
          <p>This is a computer-generated tax invoice. Zero physical signature required.</p>
          <p style="margin-top: 4px;">Thank you for partnering with JobsBox!</p>
        </div>
      </div>
    </body>
    </html>
  `;
}
