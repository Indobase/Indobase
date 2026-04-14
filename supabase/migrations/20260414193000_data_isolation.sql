-- Data Isolation & privacy Fix
-- This migration ensures that users can only see their own data (products, orders, etc.)
-- and that the login/signup process remains undisturbed.

-- 1. Helper Function: Get current user ID (alias for auth.uid())
CREATE OR REPLACE FUNCTION public.current_user_id()
RETURNS UUID AS $$
  SELECT auth.uid();
$$ LANGUAGE sql STABLE;

-- 2. Ensure Schema exists for key tables
-- We use IF NOT EXISTS to avoid errors if the tables were created manually or in other branches.

-- Products Table
CREATE TABLE IF NOT EXISTS public.products (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    description TEXT,
    price DECIMAL(10,2) NOT NULL,
    category TEXT,
    image_url TEXT,
    is_featured BOOLEAN DEFAULT FALSE,
    stock_quantity INTEGER DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ADD user_id to products if not exists
DO $$ 
BEGIN 
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='products' AND column_name='user_id') THEN
        ALTER TABLE public.products ADD COLUMN user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE;
    END IF;
END $$;

-- Orders Table
CREATE TABLE IF NOT EXISTS public.orders (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
    total_amount DECIMAL(10,2) NOT NULL,
    status TEXT DEFAULT 'pending',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Cart Table
CREATE TABLE IF NOT EXISTS public.cart (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
    product_id UUID REFERENCES public.products(id) ON DELETE CASCADE NOT NULL,
    quantity INTEGER DEFAULT 1,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(user_id, product_id)
);

-- Order Items Table
CREATE TABLE IF NOT EXISTS public.order_items (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    order_id UUID REFERENCES public.orders(id) ON DELETE CASCADE NOT NULL,
    product_id UUID REFERENCES public.products(id) ON DELETE SET NULL,
    quantity INTEGER NOT NULL,
    price DECIMAL(10,2) NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Profiles / Users Table (Extended profiles)
CREATE TABLE IF NOT EXISTS public.users (
    id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    full_name TEXT,
    avatar_url TEXT,
    role TEXT DEFAULT 'user',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 3. Enable Row Level Security (RLS)
ALTER TABLE public.products ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cart ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.order_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;

-- 4. RLS POLICIES FOR DATA ISOLATION

-- PRODUCTS: Users only see/manage THEIR OWN products
-- Note: If you want a public marketplace, change SELECT to (true)
CREATE POLICY "Users can only see their own products" 
ON public.products FOR SELECT 
USING (auth.uid() = user_id);

CREATE POLICY "Users can only insert their own products" 
ON public.products FOR INSERT 
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can only update their own products" 
ON public.products FOR UPDATE 
USING (auth.uid() = user_id);

CREATE POLICY "Users can only delete their own products" 
ON public.products FOR DELETE 
USING (auth.uid() = user_id);


-- ORDERS: Users see/manage THEIR OWN orders
CREATE POLICY "Users can only see their own orders" 
ON public.orders FOR SELECT 
USING (auth.uid() = user_id);

CREATE POLICY "Users can only insert their own orders" 
ON public.orders FOR INSERT 
WITH CHECK (auth.uid() = user_id);


-- CART: Users see/manage THEIR OWN cart
CREATE POLICY "Users can only see their own cart" 
ON public.cart FOR SELECT 
USING (auth.uid() = user_id);

CREATE POLICY "Users can only insert their own cart" 
ON public.cart FOR INSERT 
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can only update their own cart" 
ON public.cart FOR UPDATE 
USING (auth.uid() = user_id);

CREATE POLICY "Users can only delete their own cart" 
ON public.cart FOR DELETE 
USING (auth.uid() = user_id);


-- ORDER ITEMS: Users can see items belonging to THEIR OWN orders
CREATE POLICY "Users can see own order items" 
ON public.order_items FOR SELECT 
USING (EXISTS (
    SELECT 1 FROM public.orders 
    WHERE public.orders.id = order_id AND public.orders.user_id = auth.uid()
));

CREATE POLICY "Users can insert own order items" 
ON public.order_items FOR INSERT 
WITH CHECK (EXISTS (
    SELECT 1 FROM public.orders 
    WHERE public.orders.id = order_id AND public.orders.user_id = auth.uid()
));


-- 5. SAFETY POLICIES FOR LOGIN/SIGNUP (USERS TABLE)

-- Allow public to see basic profile (optional, but safer for UI)
-- Or restrict it to: USING (auth.uid() = id) for strict privacy
CREATE POLICY "Public profiles are viewable by everyone" 
ON public.users FOR SELECT 
USING (true);

-- CRITICAL: Allow user to create their own record during signup
CREATE POLICY "Allow individual profile creation" 
ON public.users FOR INSERT 
WITH CHECK (auth.uid() = id);

-- Allow user to update their own profile
CREATE POLICY "Users can update their own profile" 
ON public.users FOR UPDATE 
USING (auth.uid() = id);

-- 6. Trigger for Updating Metadata (Optional but good practice)
-- Ensure updated_at is always refreshed
CREATE OR REPLACE FUNCTION public.handle_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Apply trigger to tables
DO $$ 
BEGIN 
    IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'tr_products_updated_at') THEN
        CREATE TRIGGER tr_products_updated_at BEFORE UPDATE ON public.products FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'tr_orders_updated_at') THEN
        CREATE TRIGGER tr_orders_updated_at BEFORE UPDATE ON public.orders FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'tr_users_updated_at') THEN
        CREATE TRIGGER tr_users_updated_at BEFORE UPDATE ON public.users FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();
    END IF;
END $$;
