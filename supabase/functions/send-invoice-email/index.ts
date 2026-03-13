// Invoice Email Template
// Sends monthly invoice emails with INR pricing and GST details

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
    const { to, subject, invoiceData, currency = 'INR' } = await req.json();

    if (!to || !invoiceData) {
      throw new Error('Missing required parameters: to, subject, invoiceData');
    }

    const emailHtml = createInvoiceEmail(invoiceData, currency);

    // Send via Resend
    const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY');
    
    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${RESEND_API_KEY}`,
      },
      body: JSON.stringify({
        from: Deno.env.get('EMAIL_FROM') || 'Billing <billing@yourplatform.com>',
        to: [to],
        subject: subject,
        html: emailHtml,
        tags: [
          { name: 'type', value: 'invoice' },
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
        message: 'Invoice email sent successfully'
      }),
      { 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200,
      }
    );
  } catch (error) {
    console.error('Error sending invoice:', error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 500,
      }
    );
  }
});

function createInvoiceEmail(invoiceData: any, currency: string): string {
  const config = getCurrencyConfig(currency);
  
  const subtotal = formatCurrency(invoiceData.subtotal, currency);
  const taxAmount = formatCurrency(invoiceData.tax || 0, currency);
  const total = formatCurrency(invoiceData.total, currency);
  const gstRate = currency === 'INR' ? '18%' : 'Tax';

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
      max-width: 700px;
      margin: 40px auto;
      background: white;
      border-radius: 8px;
      overflow: hidden;
      box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);
    }
    .header {
      background: linear-gradient(135deg, #10B981 0%, #059669 100%);
      color: white;
      padding: 40px 32px;
      text-align: center;
    }
    .header h1 {
      margin: 0;
      font-size: 28px;
      font-weight: 700;
    }
    .header p {
      margin: 8px 0 0 0;
      opacity: 0.9;
      font-size: 16px;
    }
    .content {
      padding: 40px 32px;
    }
    .invoice-meta {
      display: grid;
      grid-template-columns: repeat(2, 1fr);
      gap: 16px;
      margin-bottom: 32px;
      padding: 24px;
      background: #f9fafb;
      border-radius: 8px;
    }
    .meta-item {
      display: flex;
      flex-direction: column;
    }
    .meta-label {
      font-size: 12px;
      color: #6b7280;
      text-transform: uppercase;
      letter-spacing: 0.05em;
      margin-bottom: 4px;
    }
    .meta-value {
      font-size: 16px;
      font-weight: 600;
      color: #111827;
    }
    .items-table {
      width: 100%;
      border-collapse: collapse;
      margin: 24px 0;
    }
    .items-table th {
      text-align: left;
      padding: 12px;
      background: #f9fafb;
      font-size: 12px;
      color: #6b7280;
      text-transform: uppercase;
      border-bottom: 2px solid #e5e7eb;
    }
    .items-table td {
      padding: 16px 12px;
      border-bottom: 1px solid #e5e7eb;
    }
    .amount-column {
      text-align: right;
      font-weight: 600;
    }
    .totals-section {
      margin-top: 32px;
      padding: 24px;
      background: #f9fafb;
      border-radius: 8px;
    }
    .total-row {
      display: flex;
      justify-content: space-between;
      padding: 8px 0;
      font-size: 14px;
    }
    .total-row.grand-total {
      border-top: 2px solid #d1d5db;
      margin-top: 16px;
      padding-top: 16px;
      font-size: 20px;
      font-weight: 700;
      color: #10B981;
    }
    .cta-button {
      display: inline-block;
      background-color: #10B981;
      color: white;
      text-decoration: none;
      padding: 14px 32px;
      border-radius: 6px;
      font-weight: 600;
      margin: 24px 0;
      text-align: center;
    }
    .cta-button:hover {
      background-color: #059669;
    }
    .gst-note {
      background-color: #FEF3C7;
      border-left: 4px solid #F59E0B;
      padding: 16px;
      margin: 24px 0;
      border-radius: 4px;
      font-size: 13px;
    }
    .footer {
      background-color: #f9fafb;
      padding: 24px 32px;
      border-top: 1px solid #e5e7eb;
      font-size: 13px;
      color: #6b7280;
    }
    .company-details {
      margin-top: 16px;
      padding-top: 16px;
      border-top: 1px solid #e5e7eb;
      font-size: 12px;
    }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1>📄 Invoice</h1>
      <p>${invoiceData.invoice_number}</p>
    </div>
    
    <div class="content">
      <p>Hello ${invoiceData.customer_name || 'Valued Customer'},</p>
      
      <p>Your invoice for ${formatDateRange(invoiceData.period_start, invoiceData.period_end)} is ready. Here are the details:</p>

      <div class="invoice-meta">
        <div class="meta-item">
          <span class="meta-label">Invoice Number</span>
          <span class="meta-value">${invoiceData.invoice_number}</span>
        </div>
        <div class="meta-item">
          <span class="meta-label">Invoice Date</span>
          <span class="meta-value">${formatDate(invoiceData.invoice_date)}</span>
        </div>
        <div class="meta-item">
          <span class="meta-label">Billing Period</span>
          <span class="meta-value">${formatDateRange(invoiceData.period_start, invoiceData.period_end)}</span>
        </div>
        <div class="meta-item">
          <span class="meta-label">Currency</span>
          <span class="meta-value">${config.name} (${config.symbol})</span>
        </div>
      </div>

      ${invoiceData.gstin ? `
      <div style="background: #EFF6FF; padding: 16px; border-radius: 8px; margin-bottom: 24px;">
        <strong>Billing Details:</strong><br/>
        ${invoiceData.customer_name ? `Customer Name: ${invoiceData.customer_name}<br/>` : ''}
        GSTIN: ${invoiceData.gstin}<br/>
        ${invoiceData.billing_address ? `Address: ${invoiceData.billing_address}` : ''}
      </div>
      ` : ''}

      <table class="items-table">
        <thead>
          <tr>
            <th>Description</th>
            <th style="text-align: right;">Quantity</th>
            <th style="text-align: right;">Unit Price</th>
            <th style="text-align: right;">Amount</th>
          </tr>
        </thead>
        <tbody>
          ${invoiceData.line_items.map((item: any, index: number) => `
          <tr>
            <td>
              <strong>${item.description}</strong><br/>
              ${item.metric_type ? `<span style="color: #6b7280; font-size: 12px;">${item.metric_type} • ${item.metric_name}</span>` : ''}
            </td>
            <td class="amount-column">${formatNumber(item.quantity)}</td>
            <td class="amount-column">${formatCurrency(item.unit_price, currency)} / ${item.unit}</td>
            <td class="amount-column">${formatCurrency(item.amount, currency)}</td>
          </tr>
          `).join('')}
        </tbody>
      </table>

      <div class="totals-section">
        <div class="total-row">
          <span>Subtotal</span>
          <span>${subtotal}</span>
        </div>
        ${invoiceData.tax > 0 ? `
        <div class="total-row">
          <span>${gstRate} Tax</span>
          <span>${taxAmount}</span>
        </div>
        ` : ''}
        ${invoiceData.discount > 0 ? `
        <div class="total-row" style="color: #10B981;">
          <span>Discount</span>
          <span>-${formatCurrency(invoiceData.discount, currency)}</span>
        </div>
        ` : ''}
        <div class="total-row grand-total">
          <span>Total Due</span>
          <span>${total}</span>
        </div>
      </div>

      ${currency === 'INR' ? `
      <div class="gst-note">
        <strong>GST Information:</strong><br/>
        This invoice includes GST at ${gstRate}.<br/>
        Supplier GSTIN: ${invoiceData.supplier_gstin || 'Not provided'}<br/>
        Place of Supply: ${invoiceData.place_of_supply || 'Not specified'}
      </div>
      ` : ''}

      <div style="text-align: center;">
        <a href="${process.env.DASHBOARD_URL}/billing/invoices/${invoiceData.invoice_id}" class="cta-button">
          View & Pay Invoice
        </a>
      </div>

      ${invoiceData.due_date ? `
      <p style="color: #DC2626; font-weight: 600;">
        ⏰ Payment Due: ${formatDate(invoiceData.due_date)}
      </p>
      ` : ''}

      <h3>Payment Methods:</h3>
      <ul style="line-height: 2;">
        ${currency === 'INR' ? `
        <li><strong>UPI:</strong> yourplatform@hdfcbank</li>
        <li><strong>Cards:</strong> All major credit/debit cards accepted</li>
        <li><strong>Net Banking:</strong> Available for all Indian banks</li>
        <li><strong>Bank Transfer:</strong> Account details on invoice PDF</li>
        ` : `
        <li>Credit/Debit Card</li>
        <li>Bank Transfer</li>
        <li>Wire Transfer</li>
        `}
      </ul>

      <p>Questions about this invoice? <a href="${process.env.DASHBOARD_URL}/support">Contact our billing team</a></p>
    </div>

    <div class="footer">
      <p>
        Thank you for your business!<br/>
        This is an automatically generated invoice. Please retain for your records.
      </p>
      
      ${currency === 'INR' ? `
      <div class="company-details">
        <strong>Supplier Details:</strong><br/>
        Company Name: Your Platform Pvt Ltd<br/>
        Registered Address: [Your Registered Office Address]<br/>
        GSTIN: [Your GST Number]<br/>
        CIN: [Corporate Identification Number]<br/>
        Email: billing@yourplatform.in | Phone: +91-XXX-XXX-XXXX
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

function formatNumber(num: number): string {
  if (num >= 1000000) {
    return `${(num / 1000000).toFixed(1)}M`;
  }
  if (num >= 1000) {
    return `${(num / 1000).toFixed(1)}K`;
  }
  return num.toString();
}

function formatDate(dateString: string): string {
  return new Date(dateString).toLocaleDateString('en-IN', {
    year: 'numeric',
    month: 'long',
    day: 'numeric'
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
