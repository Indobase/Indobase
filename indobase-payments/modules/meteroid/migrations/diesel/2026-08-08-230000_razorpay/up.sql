-- Add RAZORPAY payment-provider variant for India settlements (Recurring Payments later)
ALTER TYPE "ConnectorProviderEnum" ADD VALUE IF NOT EXISTS 'RAZORPAY';
