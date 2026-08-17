import PaymentTransaction, { IPaymentTransaction } from "../models/payment-transaction.model";
import User from "../models/user.model";
import SubscriptionPlan from "../models/subscription-plan.model";

export async function generateInvoiceDetails(transactionId: string) {
  const transaction = await PaymentTransaction.findById(transactionId).populate("userId planId");
  if (!transaction) throw new Error("Transaction record not found");

  const user = transaction.userId as any;
  const plan = transaction.planId as any;

  const invoiceNumber = `INV-${new Date().getFullYear()}-${transaction._id.toString().substring(18).toUpperCase()}`;

  return {
    invoiceNumber,
    date: transaction.createdAt,
    amount: transaction.amount,
    currency: transaction.currency,
    status: transaction.status,
    paymentMethod: transaction.paymentMethod,
    user: {
      name: user?.name || "Customer",
      email: user?.email || "customer@example.com",
    },
    plan: {
      name: plan?.name || "JobsBox Subscription Plan",
      description: plan?.description || "Enterprise Subscription",
    },
  };
}

export function generateInvoiceHTML(invoice: any): string {
  return `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8" />
      <title>Invoice ${invoice.invoiceNumber}</title>
      <style>
        body { font-family: Arial, sans-serif; background: #f8fafc; color: #1e293b; padding: 40px; }
        .invoice-box { max-width: 800px; margin: auto; padding: 30px; background: #ffffff; border-radius: 16px; border: 1px solid #e2e8f0; }
        .header { display: flex; justify-content: space-between; align-items: center; border-bottom: 2px solid #6366f1; padding-bottom: 20px; }
        .logo { font-size: 24px; font-weight: bold; color: #4338ca; }
        .details { margin: 20px 0; }
        .table { width: 100%; border-collapse: collapse; margin-top: 20px; }
        .table th, .table td { padding: 12px; border-bottom: 1px solid #e2e8f0; text-align: left; }
        .total { text-align: right; font-size: 20px; font-weight: bold; color: #4338ca; padding-top: 20px; }
      </style>
    </head>
    <body>
      <div class="invoice-box">
        <div class="header">
          <div class="logo">JobsBox Enterprise</div>
          <div>
            <h3>INVOICE</h3>
            <p><strong>#${invoice.invoiceNumber}</strong></p>
            <p>Date: ${new Date(invoice.date).toLocaleDateString()}</p>
          </div>
        </div>

        <div class="details">
          <h4>Billed To:</h4>
          <p><strong>${invoice.user.name}</strong> (${invoice.user.email})</p>
          <p>Status: <span style="color: #10b981; font-weight: bold;">${invoice.status.toUpperCase()}</span></p>
        </div>

        <table class="table">
          <thead>
            <tr>
              <th>Description</th>
              <th>Billing Period</th>
              <th>Amount</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>${invoice.plan.name} - ${invoice.plan.description}</td>
              <td>Monthly</td>
              <td>₹${Number(invoice.amount).toLocaleString("en-IN")} ${invoice.currency}</td>
            </tr>
          </tbody>
        </table>

        <div class="total">
          Total Paid: ₹${Number(invoice.amount).toLocaleString("en-IN")} ${invoice.currency}
        </div>
      </div>
    </body>
    </html>
  `;
}
