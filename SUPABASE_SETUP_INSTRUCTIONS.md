# Supabase Setup Instructions

## Step 1: Set Up Database Schema

1. **Go to your Supabase Dashboard**: https://supabase.com/dashboard
2. **Select your project**: `badgedesigntool`
3. **Open SQL Editor**: Click "SQL Editor" in the left sidebar
4. **Run the Schema**: Copy and paste the contents of `supabase-schema.sql` into the editor
5. **Execute**: Click "Run" to create all tables, indexes, and storage buckets

## Step 2: Verify Setup

1. **Test Connection**: Visit `/api/supabase-test` in your app
2. **Check Tables**: Go to "Table Editor" in Supabase dashboard
3. **Verify Storage**: Go to "Storage" in Supabase dashboard

## Step 3: Environment Variables

Add these to your Vercel environment variables:

```env
SUPABASE_URL=https://gxzfggczycqqbbfpwaowm.supabase.co
SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imd4emZnY3p5Y3FxYmJmcHdhb3dtIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTI4MTI1MTQsImV4cCI6MjA2ODM4ODUxNH0.lzISAMZfJYtREsPe7vXKuHyhvFkuyKfyG9vUS3jaynw
SUPABASE_SERVICE_ROLE_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imd4emZnY3p5Y3FxYmJmcHdhb3dtIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc1MjgxMjUxNCwiZXhwIjoyMDY4Mzg4NTE0fQ.tkk56DHg0iJL0anUg7cBAEZOvCXYtXu_ZKraVGNuhC4
```

## Step 4: Test the Migration

1. **Deploy to Vercel**: Push your changes
2. **Test Supabase Connection**: Visit `/api/supabase-test`
3. **Test Badge Saving**: Use the new `/api/supabase-update-badge` endpoint

## Step 5: Switch to Supabase (Optional)

Once testing is successful, you can:

1. **Update BadgeDesigner Component**: Change the save endpoint to use Supabase
2. **Remove Gadget Dependencies**: Clean up old API routes
3. **Update Cart Integration**: Use Supabase data instead of cart properties

## Database Schema Overview

### Tables Created:
- **badge_designs**: Main table for storing badge designs
- **order_designs**: Links orders to specific designs

### Storage Buckets:
- **badge-images**: For storing badge thumbnails and full images

### Features:
- ✅ Row Level Security (RLS) enabled
- ✅ Automatic timestamps
- ✅ Indexes for performance
- ✅ Customer design history
- ✅ Reorder capability

## Troubleshooting

### Common Issues:

1. **"Table doesn't exist"**: Run the schema SQL again
2. **"Storage bucket not found"**: Check if bucket creation succeeded
3. **"Permission denied"**: Verify RLS policies are set up correctly

### Test Endpoints:

- `/api/supabase-test` - Test database and storage connection
- `/api/supabase-update-badge` - Test saving badge designs

## Next Steps

After successful setup:

1. **Data Migration**: Export data from Gadget and import to Supabase
2. **Frontend Updates**: Update components to use Supabase
3. **Cart Integration**: Modify cart to use Supabase data
4. **Customer Features**: Add design history and reorder functionality 