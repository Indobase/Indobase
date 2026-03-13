// Payment Confirmation Email Template
// Sends payment receipt with INR and GST details

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const { to, subject, paymentData, currency = 'INR' } = await req.json();

    if (!to || !paymentData) {
      throw new Error('Missing required parameters: to, subject, paymentData');
    }

    const emailHtml = createPaymentConfirmationEmail(paymentData, currency);

    // Send via Resend
    const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY');
    
    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${RESEND_API_KEY}`,
      },
      body: JSON.stringify({
        from: Deno.env.get('EMAIL_FROM') || 'Payments <payments@yourplatform.com>',
        to: [to],
        subject: subject,
        html: emailHtml,
        tags: [
          { name: 'type', value: 'payment_confirmation' },
          { name: 'currency', value: currency }
        ]
      }),
    });

    if (!response.ok) {
      throw new Error(`Resend error: ${await response.text()}`);
    }

    return new Response(
      JSON.stringify({ 
        success: true, 
        message: 'Payment confirmation sent successfully'
      }),
      { 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200,
      }
    );
  } catch (error) {
    console.error('Error sending payment confirmation:', error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 500,
      }
    );
  }
});

function createPaymentConfirmationEmail(paymentData: any, currency: string): string {
  const config = getCurrencyConfig(currency);
  const amount = formatCurrency(paymentData.amount, currency);
  const isSuccessful = paymentData.status === 'success' || paymentData.status === 'paid';
  
  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <style>
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      line-height: 1.6;
      color: #1f2937;
      margin: 0;
      padding: 0;
      background-color: #f3f4f6;
    }
    .container {
      max-width: 600px;
      margin: 40px auto;
      background: white;
      border-radius: 8px;
      overflow: hidden;
      box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);
    }
    .header {
      background: linear-gradient(135deg, #10B981 0%, #059669 100%);
      color: white;
      padding: 48px 32px;
      text-align: center;
    }
    .success-icon {
      font-size: 64px;
      margin-bottom: 16px;
    }
    .header h1 {
      margin: 0;
      font-size: 28px;
      font-weight: 700;
    }
    .content {
      padding: 40px 32px;
    }
    .payment-details {
      background: #f9fafb;
      padding: 24px;
      border-radius: 8px;
      margin: 24px 0;
    }
    .detail-row {
      display: flex;
      justify-content: space-between;
      padding: 12px 0;
      border-bottom: 1px solid #e5e7eb;
    }
    .detail-row:last-child {
      border-bottom: none;
      font-weight: 700;
      font-size: 18px;
      color: #10B981;
    }
    .detail-label {
      color: #6b7280;
    }
    .receipt-box {
      border: 2px solid #10B981;
      border-radius: 8px;
      padding: 24px;
      margin: 24px 0;
      text-align: center;
    }
    .receipt-amount {
      font-size: 48px;
      font-weight: 700;
      color: #10B981;
      margin: 16px 0;
    }
    .gst-breakdown {
      background: #FEF3C7;
      border-left: 4px solid #F59E0B;
      padding: 16px;
      margin: 24px 0;
      font-size: 13px;
    }
    .upi-details {
      background: #EFF6FF;
      border: 1px solid #3B82F6;
      border-radius: 8px;
      padding: 16px;
      margin: 24px 0;
    }
    .upi-id {
      font-family: monospace;
      font-size: 18px;
      font-weight: 700;
      color: #1e40af;
      background: white;
      padding: 8px 16px;
      border-radius: 4px;
      display: inline-block;
      margin: 8px 0;
    }
    .cta-button {
      display: inline-block;
      background-color: #10B981;
      color: white;
      text-decoration: none;
      padding: 14px 32px;
      border-radius: 6px;
      font-weight: 600;
      margin: 16px 8px 16px 0;
    }
    .cta-button.secondary {
      background-color: #f3f4f6;
      color: #374151;
    }
    .footer {
      background-color: #f9fafb;
      padding: 24px 32px;
      border-top: 1px solid #e5e7eb;
      font-size: 13px;
      color: #6b7280;
    }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <div class="success-icon">${isSuccessful ? '✅' : '⚠️'}</div>
      <h1>Payment ${isSuccessful ? 'Successful!' : 'Processing'}</h1>
      <p style="margin: 8px 0 0 0; opacity: 0.9;">Your transaction has been completed</p>
    </div>
    
    <div class="content">
      <p>Hello ${paymentData.customer_name || 'Valued Customer'},</p>
      
      <p>Thank you for your payment. This confirms that we have received your payment of <strong>${amount}</strong>.</p>

      <div class="receipt-box">
        <div style="color: #6b7280; font-size: 14px;">Amount Paid</div>
        <div class="receipt-amount">${amount}</div>
        ${currency === 'INR' ? `
        <div style="font-size: 12px; color: #6b7280;">
          (Includes ${paymentData.tax_rate || 18}% GST where applicable)
        </div>
        ` : ''}
      </div>

      <div class="payment-details">
        <div class="detail-row">
          <span class="detail-label">Transaction ID</span>
          <span>${paymentData.transaction_id}</span>
        </div>
        <div class="detail-row">
          <span class="detail-label">Invoice Number</span>
          <span>${paymentData.invoice_number}</span>
        </div>
        <div class="detail-row">
          <span class="detail-label">Payment Date</span>
          <span>${formatDate(paymentData.payment_date)}</span>
        </div>
        <div class="detail-row">
          <span class="detail-label">Payment Method</span>
          <span>${getPaymentMethodName(paymentData.payment_method)}</span>
        </div>
        ${paymentData.card_last4 ? `
        <div class="detail-row">
          <span class="detail-label">Card Details</span>
          <span>•••• •••• •••• ${paymentData.card_last4}</span>
        </div>
        ` : ''}
        ${paymentData.upi_id ? `
        <div class="detail-row">
          <span class="detail-label">Paid via UPI</span>
          <span>${paymentData.upi_id}</span>
        </div>
        ` : ''}
        <div class="detail-row">
          <span class="detail-label">Billing Period</span>
          <span>${formatDateRange(paymentData.period_start, paymentData.period_end)}</span>
        </div>
        ${currency === 'INR' && paymentData.gstin ? `
        <div class="detail-row">
          <span class="detail-label">Your GSTIN</span>
          <span>${paymentData.gstin}</span>
        </div>
        ` : ''}
        <div class="detail-row">
          <span class="detail-label">Amount</span>
          <span>${amount}</span>
        </div>
      </div>

      ${currency === 'INR' && paymentData.gst_breakdown ? `
      <div class="gst-breakdown">
        <strong>GST Breakdown:</strong><br/>
        Taxable Value: ${formatCurrency(paymentData.taxable_value, currency)}<br/>
        CGST @ 9%: ${formatCurrency(paymentData.cgst, currency)}<br/>
        SGST @ 9%: ${formatCurrency(paymentData.sgst, currency)}<br/>
        <strong>Total: ${amount}</strong>
      </div>
      ` : ''}

      ${paymentData.payment_method === 'upi' ? `
      <div class="upi-details">
        <strong>📱 UPI Transaction Details</strong><br/>
        You paid using UPI ID:<br/>
        <div class="upi-id">${paymentData.paid_via_upi}</div><br/>
        <small style="color: #6b7280;">
          Transaction Reference: ${paymentData.upi_transaction_ref}<br/>
          Bank: ${paymentData.bank_name}
        </small>
      </div>
      ` : ''}

      <div style="margin: 32px 0;">
        <a href="${process.env.DASHBOARD_URL}/billing/invoices/${paymentData.invoice_id}" class="cta-button">
          📄 Download Invoice
        </a>
        <a href="${process.env.DASHBOARD_URL}/billing/receipts/${paymentData.receipt_id}" class="cta-button secondary">
          🧾 View Receipt
        </a>
      </div>

      <h3>What's Next?</h3>
      <ul style="line-height: 2;">
        <li>A copy of this receipt has been sent to your email</li>
        <li>Your subscription has been ${isSuccessful ? 'activated' : 'pending activation'}</li>
        <li>You can download the invoice from your billing dashboard</li>
        <li>For GST invoices, check your registered email</li>
      </ul>

      ${isSuccessful ? `
      <p style="color: #10B981; font-weight: 600; margin-top: 24px;">
        ✨ Your account is now active! Enjoy our services.
      </p>
      ` : `
      <p style="color: #F59E0B; font-weight: 600; margin-top: 24px;">
        ⏳ Your payment is being processed. Access will be granted upon confirmation.
      </p>
      `}

      <p>Need help? <a href="${process.env.DASHBOARD_URL}/support">Contact our support team</a></p>
    </div>

    <div class="footer">
      <p>
        This is an automatically generated payment receipt.<br/>
        Please retain this for your records and tax purposes.
      </p>
      
      ${currency === 'INR' ? `
      <div style="margin-top: 16px; padding-top: 16px; border-top: 1px solid #e5e7eb; font-size: 11px;">
        <strong>Tax Compliance Information:</strong><br/>
        This payment is for software services.<br/>
        Supplier GSTIN: ${paymentData.supplier_gstin || '[Your GST Number]'}<br/>
        Place of Supply: ${paymentData.place_of_supply || 'Not specified'}<br/>
        Reverse Charge: Not Applicable
      </div>
      ` : ''}
      
      <p style="margin-top: 16px; font-size: 11px;">
        © ${new Date().getFullYear()} Your Platform. All rights reserved.
      </p>
    </div>
  </div>
</body>
</html>
  `.trim();
}

// Helper functions
function getCurrencyConfig(currency: string) {
  const configs: Record<string, { symbol: string; locale: string; name: string }> = {
    INR: { symbol: '₹', locale: 'en-IN', name: 'Indian Rupee' },
    USD: { symbol: '$', locale: 'en-US', name: 'US Dollar' },
    EUR: { symbol: '€', locale: 'de-DE', name: 'Euro' },
    GBP: { symbol: '£', locale: 'en-GB', name: 'British Pound' }
  };
  return configs[currency] || configs.INR;
}

function formatCurrency(amount: number, currency: string): string {
  const config = getCurrencyConfig(currency);
  
  if (currency === 'INR') {
    // Indian numbering system (lakhs and crores)
    if (amount >= 10000000) {
      return `₹${(amount / 10000000).toFixed(2)} Cr`;
    }
    if (amount >= 100000) {
      return `₹${(amount / 100000).toFixed(2)} L`;
    }
  }
  
  return `${config.symbol}${amount.toLocaleString(config.locale, { 
    minimumFractionDigits: 2, 
    maximumFractionDigits: 2 
  })}`;
}

function getPaymentMethodName(method: string): string {
  const names: Record<string, string> = {
    'card': 'Credit/Debit Card',
    'upi': 'UPI Payment',
    'netbanking': 'Net Banking',
    'wallet': 'Digital Wallet',
    'bank_transfer': 'Bank Transfer',
    'emi': 'EMI'
  };
  return names[method] || method;
}

function formatDate(dateString: string): string {
  return new Date(dateString).toLocaleDateString('en-IN', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  });
}

function formatDateRange(start: string, end: string): string {
  const startDate = new Date(start);
  const endDate = new Date(end);
  
  if (startDate.getMonth() === endDate.getMonth() && startDate.getFullYear() === endDate.getFullYear()) {
    return `${startDate.toLocaleDateString('en-IN', { month: 'long', year: 'numeric' })}`;
  }
  
  return `${formatDate(start)} - ${formatDate(end)}`;
}
