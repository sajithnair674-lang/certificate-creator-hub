alter table public.certificates add column if not exists file_path text;

-- Admins can upload/replace/delete student certificate files
create policy "Admins can upload student certificates"
on storage.objects for insert to authenticated
with check (bucket_id = 'student-certificates' and public.has_role(auth.uid(), 'admin'));

create policy "Admins can update student certificates"
on storage.objects for update to authenticated
using (bucket_id = 'student-certificates' and public.has_role(auth.uid(), 'admin'));

create policy "Admins can delete student certificates"
on storage.objects for delete to authenticated
using (bucket_id = 'student-certificates' and public.has_role(auth.uid(), 'admin'));

create policy "Admins can read student certificates"
on storage.objects for select to authenticated
using (bucket_id = 'student-certificates' and public.has_role(auth.uid(), 'admin'));