drop policy if exists "users can view own tenant" on public.tenants;
create policy "users can view own tenant"
on public.tenants
for select
using (id = public.current_tenant_id());

drop policy if exists "users can update own tenant" on public.tenants;
create policy "users can update own tenant"
on public.tenants
for update
using (id = public.current_tenant_id())
with check (id = public.current_tenant_id());

drop policy if exists "users can view tenant users" on public.users;
create policy "users can view tenant users"
on public.users
for select
using (id = auth.uid());

drop policy if exists "users can insert own tenant users" on public.users;
create policy "users can insert own tenant users"
on public.users
for insert
with check (tenant_id = public.current_tenant_id());

drop policy if exists "users can update own tenant users" on public.users;
create policy "users can update own tenant users"
on public.users
for update
using (id = auth.uid())
with check (id = auth.uid() and tenant_id = public.current_tenant_id());
