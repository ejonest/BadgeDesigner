-- Supabase Database Schema for Badge Designer
-- Run this in the Supabase SQL Editor

-- Create badge_designs table
CREATE TABLE badge_designs (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  design_id TEXT NOT NULL UNIQUE,
  product_id TEXT NOT NULL,
  shop_id TEXT NOT NULL,
  user_id TEXT,
  background_color TEXT,
  backing_price DECIMAL(10,2) DEFAULT 0,
  backing_type TEXT,
  base_price DECIMAL(10,2) DEFAULT 9.99,
  total_price DECIMAL(10,2),
  design_data JSONB,
  thumbnail_url TEXT,
  full_image_url TEXT,
  status TEXT DEFAULT 'draft' CHECK (status IN ('draft', 'saved', 'ordered', 'archived')),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create indexes for performance
CREATE INDEX idx_badge_designs_shop_id ON badge_designs(shop_id);
CREATE INDEX idx_badge_designs_user_id ON badge_designs(user_id);
CREATE INDEX idx_badge_designs_design_id ON badge_designs(design_id);
CREATE INDEX idx_badge_designs_status ON badge_designs(status);
CREATE INDEX idx_badge_designs_created_at ON badge_designs(created_at);

-- Create order_designs table for linking orders to designs
CREATE TABLE order_designs (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  order_id TEXT NOT NULL,
  design_id TEXT NOT NULL,
  customer_id TEXT NOT NULL,
  product_id TEXT NOT NULL,
  design_data JSONB,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create indexes for order_designs
CREATE INDEX idx_order_designs_order_id ON order_designs(order_id);
CREATE INDEX idx_order_designs_customer_id ON order_designs(customer_id);
CREATE INDEX idx_order_designs_design_id ON order_designs(design_id);

-- Enable Row Level Security
ALTER TABLE badge_designs ENABLE ROW LEVEL SECURITY;
ALTER TABLE order_designs ENABLE ROW LEVEL SECURITY;

-- Create policies for badge_designs
CREATE POLICY "Users can view their own designs" ON badge_designs
  FOR SELECT USING (auth.uid()::text = user_id);

CREATE POLICY "Users can insert their own designs" ON badge_designs
  FOR INSERT WITH CHECK (auth.uid()::text = user_id);

CREATE POLICY "Users can update their own designs" ON badge_designs
  FOR UPDATE USING (auth.uid()::text = user_id);

-- Create policies for order_designs
CREATE POLICY "Users can view their own orders" ON order_designs
  FOR SELECT USING (auth.uid()::text = customer_id);

CREATE POLICY "Users can insert their own orders" ON order_designs
  FOR INSERT WITH CHECK (auth.uid()::text = customer_id);

-- Create function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Create trigger for updated_at
CREATE TRIGGER update_badge_designs_updated_at 
    BEFORE UPDATE ON badge_designs 
    FOR EACH ROW 
    EXECUTE FUNCTION update_updated_at_column();

-- Create storage bucket for badge images
INSERT INTO storage.buckets (id, name, public) 
VALUES ('badge-images', 'badge-images', true);

-- Create storage policies
CREATE POLICY "Public read access" ON storage.objects
  FOR SELECT USING (bucket_id = 'badge-images');

CREATE POLICY "Authenticated users can upload" ON storage.objects
  FOR INSERT WITH CHECK (
    bucket_id = 'badge-images' 
    AND auth.role() = 'authenticated'
  );

CREATE POLICY "Users can update their own files" ON storage.objects
  FOR UPDATE USING (
    bucket_id = 'badge-images' 
    AND auth.uid()::text = (storage.foldername(name))[1]
  );

-- Create function to get customer design history
CREATE OR REPLACE FUNCTION get_customer_designs(customer_id_param TEXT)
RETURNS TABLE (
  id UUID,
  design_id TEXT,
  product_id TEXT,
  shop_id TEXT,
  background_color TEXT,
  backing_price DECIMAL(10,2),
  backing_type TEXT,
  base_price DECIMAL(10,2),
  total_price DECIMAL(10,2),
  design_data JSONB,
  thumbnail_url TEXT,
  full_image_url TEXT,
  status TEXT,
  created_at TIMESTAMP WITH TIME ZONE,
  updated_at TIMESTAMP WITH TIME ZONE
) AS $$
BEGIN
  RETURN QUERY
  SELECT 
    bd.id,
    bd.design_id,
    bd.product_id,
    bd.shop_id,
    bd.background_color,
    bd.backing_price,
    bd.backing_type,
    bd.base_price,
    bd.total_price,
    bd.design_data,
    bd.thumbnail_url,
    bd.full_image_url,
    bd.status,
    bd.created_at,
    bd.updated_at
  FROM badge_designs bd
  WHERE bd.user_id = customer_id_param
  ORDER BY bd.created_at DESC;
END;
$$ LANGUAGE plpgsql; 