import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createClient as createAdminClient } from '@supabase/supabase-js';

export async function POST(request: NextRequest) {
  // Verify the calling user is authenticated
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await request.json() as {
    email: string;
    password: string;
    contactName?: string;
    companyName?: string;
    phone?: string;
    plan?: string;
    agencyId?: string;
    monthlyFee?: number;
    minutesIncluded?: number;
    clientOverageRate?: number;
  };

  const { email, password, contactName, companyName, phone, plan, agencyId,
    monthlyFee, minutesIncluded, clientOverageRate } = body;

  if (!email || !password) {
    return NextResponse.json({ error: 'Email and password are required' }, { status: 400 });
  }
  if (password.length < 8) {
    return NextResponse.json({ error: 'Password must be at least 8 characters' }, { status: 400 });
  }

  // Use service role key to create the user (bypasses email confirmation)
  const adminClient = createAdminClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  const { data: newUser, error: createError } = await adminClient.auth.admin.createUser({
    email,
    password,
    email_confirm: true, // pre-confirm so they can log in immediately
    user_metadata: {
      full_name: contactName || '',
      company: companyName || '',
      role: 'client',
    },
  });

  if (createError) {
    return NextResponse.json({ error: createError.message }, { status: 400 });
  }

  // Create sub_account record linked to the new user
  const { data: subAccount, error: subError } = await supabase
    .from('sub_accounts')
    .insert({
      agency_id: agencyId || user.id,
      name: contactName || companyName || email,
      company_name: companyName || '',
      email,
      phone: phone || null,
      plan: plan || 'starter',
      monthly_fee: monthlyFee || 39,
      minutes_included: minutesIncluded || 150,
      client_overage_rate: clientOverageRate || 0.25,
      status: 'active',
      user_id: newUser.user.id,
    })
    .select('id')
    .single();

  if (subError) {
    // Clean up the created user if sub-account insertion fails
    await adminClient.auth.admin.deleteUser(newUser.user.id);
    return NextResponse.json({ error: subError.message }, { status: 500 });
  }

  return NextResponse.json({
    success: true,
    userId: newUser.user.id,
    subAccountId: subAccount.id,
    credentials: { email, password }, // returned so agency admin can share with client
  });
}
