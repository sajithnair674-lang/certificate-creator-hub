CREATE TABLE public.certificate_designs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  storage_path text NOT NULL,
  file_name text NOT NULL,
  mime_type text NOT NULL,
  layout jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT certificate_designs_single CHECK (id IS NOT NULL)
);

CREATE UNIQUE INDEX certificate_designs_singleton ON public.certificate_designs ((true));

GRANT SELECT ON public.certificate_designs TO anon, authenticated;
GRANT INSERT, UPDATE, DELETE ON public.certificate_designs TO authenticated;
GRANT ALL ON public.certificate_designs TO service_role;

ALTER TABLE public.certificate_designs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can view the certificate design"
  ON public.certificate_designs FOR SELECT
  TO anon, authenticated
  USING (true);

CREATE POLICY "Admins can manage the certificate design"
  ON public.certificate_designs FOR ALL
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE TRIGGER certificate_designs_set_updated_at
  BEFORE UPDATE ON public.certificate_designs
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE POLICY "Anyone can view uploaded designs"
  ON storage.objects FOR SELECT
  TO anon, authenticated
  USING (bucket_id = 'certificate-designs');

CREATE POLICY "Admins can upload designs"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (bucket_id = 'certificate-designs' AND public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can delete designs"
  ON storage.objects FOR DELETE
  TO authenticated
  USING (bucket_id = 'certificate-designs' AND public.has_role(auth.uid(), 'admin'));