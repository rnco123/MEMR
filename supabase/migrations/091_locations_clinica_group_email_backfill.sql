-- One-time backfill: location_group + email from Clinica Locations, matched by address.
-- Clinica email source: COALESCE(email_address, email).

CREATE OR REPLACE FUNCTION public.normalize_location_address(raw text)
RETURNS text
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT lower(regexp_replace(trim(coalesce(raw, '')), '\s+', ' ', 'g'));
$$;

UPDATE public.locations AS l
SET
  location_group = v.location_group,
  email = v.email,
  external_location_id = v.external_id,
  updated_at = now()
FROM (
  VALUES
    ('1114 E Seminary Dr, Suite B, Fort Worth, TX 76115', 'A', 'clinicasanmiguel.tx@gmail.com', 2),
    ('2731 W Northwest Hwy, Dallas, TX 75220', 'A', 'clinicasanmiguel.tx@gmail.com', 3),
    ('787 E Park Row Dr, Arlington, TX 76010', 'A', 'clinicasanmiguel.tx@gmail.com', 5),
    ('11411 E NW Hwy, Dallas, TX 75218', 'A', 'clinicasanmiguel.tx@gmail.com', 6),
    ('14510 S Josey Ln, Farmers Branch, TX 75234', 'A', 'clinicasanmiguel.tx@gmail.com', 7),
    ('4819 River Oaks Blvd, Fort Worth, TX 76114', 'A', 'clinicasanmiguel.tx@gmail.com', 8),
    ('1114 E Seminary Dr, Fort Worth, TX 76115', 'A', 'clinicasanmiguel.tx@gmail.com', 9),
    ('11243 Veterans Memorial Dr, Houston, TX 77067', 'B', 'clinicasanmiguel.tx@gmail.com', 11),
    ('12741 East Fwy, Houston, TX 77015', 'B', 'clinicasanmiguel.tx@gmail.com', 12),
    ('25538 I-45, Spring, TX 77386', 'B', 'clinicasanmiguel.tx@gmail.com', 13),
    ('4240 Hwy 6 N, Houston, TX 77084', 'B', 'clinicasanmiguel.tx@gmail.com', 14),
    ('5712 Fondren Rd, Houston, TX 77036', 'B', 'clinicasanmiguel.tx@gmail.com', 15),
    ('12033 Hwy 6, Fresno, TX 77545', 'B', 'clinicasanmiguel.tx@gmail.com', 16),
    ('2777 Shaver St, Pasadena, TX 77502', 'B', 'clinicasanmiguel.tx@gmail.com', 17),
    ('680 SW Military Dr., Suite EF, San Antonio, TX 78221', 'C', 'clinicasanmiguel.tx@gmail.com', 18),
    ('13032 Nacogdoches Rd #211, San Antonio, TX 78217', 'C', 'clinicasanmiguel.tx@gmail.com', 19),
    ('5525 Blanco Rd, San Antonio, Tx 78216', 'C', 'clinicasanmiguel.tx@gmail.com', 26),
    ('428 E Jefferson Blvd #123, Dallas, TX 75203', NULL, 'clinicasanmiguel.tx@gmail.com', 27),
    ('9325 Kempwood Dr, Houston, TX 77080, United States', 'CLN-28', 'kempwoodclinic@myclinicmd.com', 28)
) AS v(address, location_group, email, external_id)
WHERE public.normalize_location_address(l.address) = public.normalize_location_address(v.address);

COMMENT ON COLUMN public.locations.email IS
  'Clinic contact email (may be copied from Clinica Locations email / email_address).';
