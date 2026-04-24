-- Stage 2.1 — contacts.timezone auto-fill trigger (DB safety net)
-- ALREADY APPLIED to Supabase via MCP out-of-band. This file exists for
-- git history and for bringing a fresh local dev DB into line with prod.
-- CREATE OR REPLACE + DROP TRIGGER IF EXISTS make it idempotent.
--
-- Backstop for client-side resolveContactTimezone(). If any write path to
-- public.contacts fails to supply a timezone (client bug, third-party
-- integration, direct DB write, etc), this BEFORE INSERT/UPDATE trigger
-- infers a timezone from the phone's NANPA area code. If area code lookup
-- fails, falls back to organizations.default_timezone. Last resort: 'America/New_York'.
--
-- Lookup covers the same ~360 US + CA area codes as the client-side
-- NANPA table, including split-TZ overrides: FL panhandle (850/448),
-- TX El Paso (915), east TN (423/865/729), west KY (270/364), west NE (308).
-- Client-side resolver is authoritative; this is defense-in-depth.

CREATE OR REPLACE FUNCTION public.fn_contacts_autofill_timezone()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
DECLARE
  digits TEXT;
  national TEXT;
  area_code TEXT;
  inferred_tz TEXT;
  org_default_tz TEXT;
BEGIN
  -- If timezone already set, nothing to do.
  IF NEW.timezone IS NOT NULL AND NEW.timezone <> '' THEN
    RETURN NEW;
  END IF;

  -- Extract area code from phone (prefer phone, fall back to cell_phone).
  digits := regexp_replace(COALESCE(NEW.phone, NEW.cell_phone, ''), '\D', '', 'g');
  IF length(digits) < 10 THEN
    digits := NULL;
  ELSIF length(digits) = 11 AND left(digits, 1) = '1' THEN
    national := substring(digits FROM 2);
  ELSIF length(digits) = 10 THEN
    national := digits;
  ELSE
    national := NULL;
  END IF;

  IF national IS NOT NULL THEN
    area_code := left(national, 3);

    -- Map area code → IANA timezone. Compact lookup covering US+CA, with
    -- split-state defaults picking the dominant TZ. For exact splits
    -- (FL panhandle, TX El Paso, east TN, west KY, west NE), the
    -- client-side resolver is authoritative; this trigger is a backstop.
    inferred_tz := CASE area_code
      -- Pacific
      WHEN '206' THEN 'America/Los_Angeles' WHEN '253' THEN 'America/Los_Angeles'
      WHEN '360' THEN 'America/Los_Angeles' WHEN '425' THEN 'America/Los_Angeles'
      WHEN '509' THEN 'America/Los_Angeles' WHEN '564' THEN 'America/Los_Angeles'
      WHEN '458' THEN 'America/Los_Angeles' WHEN '503' THEN 'America/Los_Angeles'
      WHEN '541' THEN 'America/Los_Angeles' WHEN '971' THEN 'America/Los_Angeles'
      WHEN '209' THEN 'America/Los_Angeles' WHEN '213' THEN 'America/Los_Angeles'
      WHEN '279' THEN 'America/Los_Angeles' WHEN '310' THEN 'America/Los_Angeles'
      WHEN '323' THEN 'America/Los_Angeles' WHEN '341' THEN 'America/Los_Angeles'
      WHEN '350' THEN 'America/Los_Angeles' WHEN '357' THEN 'America/Los_Angeles'
      WHEN '369' THEN 'America/Los_Angeles' WHEN '408' THEN 'America/Los_Angeles'
      WHEN '415' THEN 'America/Los_Angeles' WHEN '424' THEN 'America/Los_Angeles'
      WHEN '442' THEN 'America/Los_Angeles' WHEN '510' THEN 'America/Los_Angeles'
      WHEN '530' THEN 'America/Los_Angeles' WHEN '559' THEN 'America/Los_Angeles'
      WHEN '562' THEN 'America/Los_Angeles' WHEN '619' THEN 'America/Los_Angeles'
      WHEN '626' THEN 'America/Los_Angeles' WHEN '628' THEN 'America/Los_Angeles'
      WHEN '650' THEN 'America/Los_Angeles' WHEN '657' THEN 'America/Los_Angeles'
      WHEN '661' THEN 'America/Los_Angeles' WHEN '669' THEN 'America/Los_Angeles'
      WHEN '707' THEN 'America/Los_Angeles' WHEN '714' THEN 'America/Los_Angeles'
      WHEN '738' THEN 'America/Los_Angeles' WHEN '747' THEN 'America/Los_Angeles'
      WHEN '760' THEN 'America/Los_Angeles' WHEN '805' THEN 'America/Los_Angeles'
      WHEN '818' THEN 'America/Los_Angeles' WHEN '820' THEN 'America/Los_Angeles'
      WHEN '831' THEN 'America/Los_Angeles' WHEN '837' THEN 'America/Los_Angeles'
      WHEN '840' THEN 'America/Los_Angeles' WHEN '858' THEN 'America/Los_Angeles'
      WHEN '909' THEN 'America/Los_Angeles' WHEN '916' THEN 'America/Los_Angeles'
      WHEN '925' THEN 'America/Los_Angeles' WHEN '949' THEN 'America/Los_Angeles'
      WHEN '951' THEN 'America/Los_Angeles'
      WHEN '702' THEN 'America/Los_Angeles' WHEN '725' THEN 'America/Los_Angeles'
      WHEN '775' THEN 'America/Los_Angeles'
      -- Arizona (no DST)
      WHEN '480' THEN 'America/Phoenix' WHEN '520' THEN 'America/Phoenix'
      WHEN '602' THEN 'America/Phoenix' WHEN '623' THEN 'America/Phoenix'
      WHEN '928' THEN 'America/Phoenix'
      -- Mountain
      WHEN '303' THEN 'America/Denver' WHEN '719' THEN 'America/Denver'
      WHEN '720' THEN 'America/Denver' WHEN '748' THEN 'America/Denver'
      WHEN '970' THEN 'America/Denver' WHEN '983' THEN 'America/Denver'
      WHEN '208' THEN 'America/Boise' WHEN '986' THEN 'America/Boise'
      WHEN '406' THEN 'America/Denver' WHEN '505' THEN 'America/Denver'
      WHEN '575' THEN 'America/Denver' WHEN '385' THEN 'America/Denver'
      WHEN '435' THEN 'America/Denver' WHEN '801' THEN 'America/Denver'
      WHEN '307' THEN 'America/Denver' WHEN '915' THEN 'America/Denver'
      WHEN '308' THEN 'America/Denver'
      -- Central
      WHEN '205' THEN 'America/Chicago' WHEN '251' THEN 'America/Chicago'
      WHEN '256' THEN 'America/Chicago' WHEN '334' THEN 'America/Chicago'
      WHEN '483' THEN 'America/Chicago' WHEN '659' THEN 'America/Chicago'
      WHEN '938' THEN 'America/Chicago'
      WHEN '327' THEN 'America/Chicago' WHEN '479' THEN 'America/Chicago'
      WHEN '501' THEN 'America/Chicago' WHEN '870' THEN 'America/Chicago'
      WHEN '217' THEN 'America/Chicago' WHEN '224' THEN 'America/Chicago'
      WHEN '309' THEN 'America/Chicago' WHEN '312' THEN 'America/Chicago'
      WHEN '331' THEN 'America/Chicago' WHEN '447' THEN 'America/Chicago'
      WHEN '464' THEN 'America/Chicago' WHEN '618' THEN 'America/Chicago'
      WHEN '630' THEN 'America/Chicago' WHEN '708' THEN 'America/Chicago'
      WHEN '730' THEN 'America/Chicago' WHEN '773' THEN 'America/Chicago'
      WHEN '779' THEN 'America/Chicago' WHEN '815' THEN 'America/Chicago'
      WHEN '847' THEN 'America/Chicago' WHEN '861' THEN 'America/Chicago'
      WHEN '872' THEN 'America/Chicago'
      WHEN '319' THEN 'America/Chicago' WHEN '515' THEN 'America/Chicago'
      WHEN '563' THEN 'America/Chicago' WHEN '641' THEN 'America/Chicago'
      WHEN '712' THEN 'America/Chicago'
      WHEN '316' THEN 'America/Chicago' WHEN '620' THEN 'America/Chicago'
      WHEN '785' THEN 'America/Chicago' WHEN '913' THEN 'America/Chicago'
      WHEN '270' THEN 'America/Chicago' WHEN '364' THEN 'America/Chicago'
      WHEN '225' THEN 'America/Chicago' WHEN '318' THEN 'America/Chicago'
      WHEN '337' THEN 'America/Chicago' WHEN '457' THEN 'America/Chicago'
      WHEN '504' THEN 'America/Chicago' WHEN '985' THEN 'America/Chicago'
      WHEN '218' THEN 'America/Chicago' WHEN '320' THEN 'America/Chicago'
      WHEN '507' THEN 'America/Chicago' WHEN '612' THEN 'America/Chicago'
      WHEN '651' THEN 'America/Chicago' WHEN '763' THEN 'America/Chicago'
      WHEN '924' THEN 'America/Chicago' WHEN '952' THEN 'America/Chicago'
      WHEN '228' THEN 'America/Chicago' WHEN '471' THEN 'America/Chicago'
      WHEN '601' THEN 'America/Chicago' WHEN '662' THEN 'America/Chicago'
      WHEN '769' THEN 'America/Chicago'
      WHEN '235' THEN 'America/Chicago' WHEN '314' THEN 'America/Chicago'
      WHEN '417' THEN 'America/Chicago' WHEN '557' THEN 'America/Chicago'
      WHEN '573' THEN 'America/Chicago' WHEN '636' THEN 'America/Chicago'
      WHEN '660' THEN 'America/Chicago' WHEN '816' THEN 'America/Chicago'
      WHEN '975' THEN 'America/Chicago'
      WHEN '402' THEN 'America/Chicago' WHEN '531' THEN 'America/Chicago'
      WHEN '701' THEN 'America/Chicago' WHEN '605' THEN 'America/Chicago'
      WHEN '405' THEN 'America/Chicago' WHEN '539' THEN 'America/Chicago'
      WHEN '572' THEN 'America/Chicago' WHEN '580' THEN 'America/Chicago'
      WHEN '918' THEN 'America/Chicago'
      WHEN '615' THEN 'America/Chicago' WHEN '629' THEN 'America/Chicago'
      WHEN '731' THEN 'America/Chicago' WHEN '901' THEN 'America/Chicago'
      WHEN '931' THEN 'America/Chicago'
      WHEN '210' THEN 'America/Chicago' WHEN '214' THEN 'America/Chicago'
      WHEN '254' THEN 'America/Chicago' WHEN '281' THEN 'America/Chicago'
      WHEN '325' THEN 'America/Chicago' WHEN '346' THEN 'America/Chicago'
      WHEN '361' THEN 'America/Chicago' WHEN '409' THEN 'America/Chicago'
      WHEN '430' THEN 'America/Chicago' WHEN '432' THEN 'America/Chicago'
      WHEN '469' THEN 'America/Chicago' WHEN '512' THEN 'America/Chicago'
      WHEN '621' THEN 'America/Chicago' WHEN '682' THEN 'America/Chicago'
      WHEN '713' THEN 'America/Chicago' WHEN '726' THEN 'America/Chicago'
      WHEN '737' THEN 'America/Chicago' WHEN '806' THEN 'America/Chicago'
      WHEN '817' THEN 'America/Chicago' WHEN '830' THEN 'America/Chicago'
      WHEN '832' THEN 'America/Chicago' WHEN '903' THEN 'America/Chicago'
      WHEN '936' THEN 'America/Chicago' WHEN '940' THEN 'America/Chicago'
      WHEN '945' THEN 'America/Chicago' WHEN '956' THEN 'America/Chicago'
      WHEN '972' THEN 'America/Chicago' WHEN '979' THEN 'America/Chicago'
      WHEN '262' THEN 'America/Chicago' WHEN '274' THEN 'America/Chicago'
      WHEN '353' THEN 'America/Chicago' WHEN '414' THEN 'America/Chicago'
      WHEN '534' THEN 'America/Chicago' WHEN '608' THEN 'America/Chicago'
      WHEN '715' THEN 'America/Chicago' WHEN '920' THEN 'America/Chicago'
      -- Eastern
      WHEN '202' THEN 'America/New_York' WHEN '771' THEN 'America/New_York'
      WHEN '203' THEN 'America/New_York' WHEN '475' THEN 'America/New_York'
      WHEN '860' THEN 'America/New_York' WHEN '959' THEN 'America/New_York'
      WHEN '302' THEN 'America/New_York'
      WHEN '239' THEN 'America/New_York' WHEN '305' THEN 'America/New_York'
      WHEN '321' THEN 'America/New_York' WHEN '324' THEN 'America/New_York'
      WHEN '352' THEN 'America/New_York' WHEN '386' THEN 'America/New_York'
      WHEN '407' THEN 'America/New_York' WHEN '561' THEN 'America/New_York'
      WHEN '645' THEN 'America/New_York' WHEN '656' THEN 'America/New_York'
      WHEN '689' THEN 'America/New_York' WHEN '727' THEN 'America/New_York'
      WHEN '728' THEN 'America/New_York' WHEN '754' THEN 'America/New_York'
      WHEN '772' THEN 'America/New_York' WHEN '786' THEN 'America/New_York'
      WHEN '813' THEN 'America/New_York' WHEN '863' THEN 'America/New_York'
      WHEN '904' THEN 'America/New_York' WHEN '941' THEN 'America/New_York'
      WHEN '954' THEN 'America/New_York'
      WHEN '850' THEN 'America/Chicago' WHEN '448' THEN 'America/Chicago'
      WHEN '229' THEN 'America/New_York' WHEN '404' THEN 'America/New_York'
      WHEN '470' THEN 'America/New_York' WHEN '478' THEN 'America/New_York'
      WHEN '678' THEN 'America/New_York' WHEN '706' THEN 'America/New_York'
      WHEN '762' THEN 'America/New_York' WHEN '770' THEN 'America/New_York'
      WHEN '912' THEN 'America/New_York' WHEN '943' THEN 'America/New_York'
      WHEN '219' THEN 'America/Indiana/Indianapolis' WHEN '260' THEN 'America/Indiana/Indianapolis'
      WHEN '317' THEN 'America/Indiana/Indianapolis' WHEN '463' THEN 'America/Indiana/Indianapolis'
      WHEN '574' THEN 'America/Indiana/Indianapolis' WHEN '765' THEN 'America/Indiana/Indianapolis'
      WHEN '812' THEN 'America/Indiana/Indianapolis' WHEN '930' THEN 'America/Indiana/Indianapolis'
      WHEN '502' THEN 'America/New_York' WHEN '606' THEN 'America/New_York'
      WHEN '859' THEN 'America/New_York'
      WHEN '207' THEN 'America/New_York'
      WHEN '227' THEN 'America/New_York' WHEN '240' THEN 'America/New_York'
      WHEN '301' THEN 'America/New_York' WHEN '410' THEN 'America/New_York'
      WHEN '443' THEN 'America/New_York' WHEN '667' THEN 'America/New_York'
      WHEN '339' THEN 'America/New_York' WHEN '351' THEN 'America/New_York'
      WHEN '413' THEN 'America/New_York' WHEN '508' THEN 'America/New_York'
      WHEN '617' THEN 'America/New_York' WHEN '774' THEN 'America/New_York'
      WHEN '781' THEN 'America/New_York' WHEN '857' THEN 'America/New_York'
      WHEN '978' THEN 'America/New_York'
      WHEN '231' THEN 'America/Detroit' WHEN '248' THEN 'America/Detroit'
      WHEN '269' THEN 'America/Detroit' WHEN '313' THEN 'America/Detroit'
      WHEN '517' THEN 'America/Detroit' WHEN '586' THEN 'America/Detroit'
      WHEN '616' THEN 'America/Detroit' WHEN '679' THEN 'America/Detroit'
      WHEN '734' THEN 'America/Detroit' WHEN '810' THEN 'America/Detroit'
      WHEN '906' THEN 'America/Detroit' WHEN '947' THEN 'America/Detroit'
      WHEN '989' THEN 'America/Detroit'
      WHEN '603' THEN 'America/New_York'
      WHEN '201' THEN 'America/New_York' WHEN '551' THEN 'America/New_York'
      WHEN '609' THEN 'America/New_York' WHEN '640' THEN 'America/New_York'
      WHEN '732' THEN 'America/New_York' WHEN '848' THEN 'America/New_York'
      WHEN '856' THEN 'America/New_York' WHEN '862' THEN 'America/New_York'
      WHEN '908' THEN 'America/New_York' WHEN '973' THEN 'America/New_York'
      WHEN '212' THEN 'America/New_York' WHEN '315' THEN 'America/New_York'
      WHEN '329' THEN 'America/New_York' WHEN '332' THEN 'America/New_York'
      WHEN '347' THEN 'America/New_York' WHEN '363' THEN 'America/New_York'
      WHEN '516' THEN 'America/New_York' WHEN '518' THEN 'America/New_York'
      WHEN '585' THEN 'America/New_York' WHEN '607' THEN 'America/New_York'
      WHEN '624' THEN 'America/New_York' WHEN '631' THEN 'America/New_York'
      WHEN '646' THEN 'America/New_York' WHEN '680' THEN 'America/New_York'
      WHEN '716' THEN 'America/New_York' WHEN '718' THEN 'America/New_York'
      WHEN '838' THEN 'America/New_York' WHEN '845' THEN 'America/New_York'
      WHEN '914' THEN 'America/New_York' WHEN '917' THEN 'America/New_York'
      WHEN '929' THEN 'America/New_York' WHEN '934' THEN 'America/New_York'
      WHEN '252' THEN 'America/New_York' WHEN '336' THEN 'America/New_York'
      WHEN '472' THEN 'America/New_York' WHEN '704' THEN 'America/New_York'
      WHEN '743' THEN 'America/New_York' WHEN '828' THEN 'America/New_York'
      WHEN '910' THEN 'America/New_York' WHEN '919' THEN 'America/New_York'
      WHEN '980' THEN 'America/New_York' WHEN '984' THEN 'America/New_York'
      WHEN '216' THEN 'America/New_York' WHEN '220' THEN 'America/New_York'
      WHEN '234' THEN 'America/New_York' WHEN '283' THEN 'America/New_York'
      WHEN '326' THEN 'America/New_York' WHEN '330' THEN 'America/New_York'
      WHEN '380' THEN 'America/New_York' WHEN '419' THEN 'America/New_York'
      WHEN '436' THEN 'America/New_York' WHEN '440' THEN 'America/New_York'
      WHEN '513' THEN 'America/New_York' WHEN '567' THEN 'America/New_York'
      WHEN '614' THEN 'America/New_York' WHEN '740' THEN 'America/New_York'
      WHEN '937' THEN 'America/New_York'
      WHEN '215' THEN 'America/New_York' WHEN '223' THEN 'America/New_York'
      WHEN '267' THEN 'America/New_York' WHEN '272' THEN 'America/New_York'
      WHEN '412' THEN 'America/New_York' WHEN '445' THEN 'America/New_York'
      WHEN '484' THEN 'America/New_York' WHEN '570' THEN 'America/New_York'
      WHEN '582' THEN 'America/New_York' WHEN '610' THEN 'America/New_York'
      WHEN '717' THEN 'America/New_York' WHEN '724' THEN 'America/New_York'
      WHEN '814' THEN 'America/New_York' WHEN '835' THEN 'America/New_York'
      WHEN '878' THEN 'America/New_York'
      WHEN '401' THEN 'America/New_York'
      WHEN '803' THEN 'America/New_York' WHEN '821' THEN 'America/New_York'
      WHEN '839' THEN 'America/New_York' WHEN '843' THEN 'America/New_York'
      WHEN '854' THEN 'America/New_York' WHEN '864' THEN 'America/New_York'
      WHEN '423' THEN 'America/New_York' WHEN '865' THEN 'America/New_York'
      WHEN '729' THEN 'America/New_York'
      WHEN '802' THEN 'America/New_York'
      WHEN '276' THEN 'America/New_York' WHEN '434' THEN 'America/New_York'
      WHEN '540' THEN 'America/New_York' WHEN '571' THEN 'America/New_York'
      WHEN '686' THEN 'America/New_York' WHEN '703' THEN 'America/New_York'
      WHEN '757' THEN 'America/New_York' WHEN '804' THEN 'America/New_York'
      WHEN '826' THEN 'America/New_York' WHEN '948' THEN 'America/New_York'
      WHEN '304' THEN 'America/New_York' WHEN '681' THEN 'America/New_York'
      -- Hawaii
      WHEN '808' THEN 'Pacific/Honolulu'
      -- Alaska
      WHEN '907' THEN 'America/Anchorage'
      -- Canadian provinces (dominant tz per province)
      WHEN '368' THEN 'America/Edmonton' WHEN '403' THEN 'America/Edmonton'
      WHEN '568' THEN 'America/Edmonton' WHEN '587' THEN 'America/Edmonton'
      WHEN '780' THEN 'America/Edmonton' WHEN '825' THEN 'America/Edmonton'
      WHEN '236' THEN 'America/Vancouver' WHEN '250' THEN 'America/Vancouver'
      WHEN '257' THEN 'America/Vancouver' WHEN '604' THEN 'America/Vancouver'
      WHEN '672' THEN 'America/Vancouver' WHEN '778' THEN 'America/Vancouver'
      WHEN '204' THEN 'America/Winnipeg' WHEN '431' THEN 'America/Winnipeg'
      WHEN '584' THEN 'America/Winnipeg'
      WHEN '428' THEN 'America/Moncton' WHEN '506' THEN 'America/Moncton'
      WHEN '709' THEN 'America/St_Johns' WHEN '879' THEN 'America/St_Johns'
      WHEN '782' THEN 'America/Halifax' WHEN '902' THEN 'America/Halifax'
      WHEN '226' THEN 'America/Toronto' WHEN '249' THEN 'America/Toronto'
      WHEN '289' THEN 'America/Toronto' WHEN '343' THEN 'America/Toronto'
      WHEN '365' THEN 'America/Toronto' WHEN '382' THEN 'America/Toronto'
      WHEN '416' THEN 'America/Toronto' WHEN '437' THEN 'America/Toronto'
      WHEN '519' THEN 'America/Toronto' WHEN '548' THEN 'America/Toronto'
      WHEN '613' THEN 'America/Toronto' WHEN '647' THEN 'America/Toronto'
      WHEN '683' THEN 'America/Toronto' WHEN '705' THEN 'America/Toronto'
      WHEN '742' THEN 'America/Toronto' WHEN '753' THEN 'America/Toronto'
      WHEN '807' THEN 'America/Toronto' WHEN '905' THEN 'America/Toronto'
      WHEN '942' THEN 'America/Toronto'
      WHEN '263' THEN 'America/Montreal' WHEN '354' THEN 'America/Montreal'
      WHEN '367' THEN 'America/Montreal' WHEN '418' THEN 'America/Montreal'
      WHEN '438' THEN 'America/Montreal' WHEN '450' THEN 'America/Montreal'
      WHEN '468' THEN 'America/Montreal' WHEN '514' THEN 'America/Montreal'
      WHEN '579' THEN 'America/Montreal' WHEN '581' THEN 'America/Montreal'
      WHEN '819' THEN 'America/Montreal' WHEN '873' THEN 'America/Montreal'
      WHEN '306' THEN 'America/Regina' WHEN '474' THEN 'America/Regina'
      WHEN '639' THEN 'America/Regina'
      WHEN '867' THEN 'America/Whitehorse'
      ELSE NULL
    END;

    IF inferred_tz IS NOT NULL THEN
      NEW.timezone := inferred_tz;
      RETURN NEW;
    END IF;
  END IF;

  -- Last resort: fall back to the org's default timezone.
  SELECT default_timezone INTO org_default_tz
  FROM public.organizations
  WHERE id = NEW.organization_id;

  IF org_default_tz IS NOT NULL THEN
    NEW.timezone := org_default_tz;
  ELSE
    NEW.timezone := 'America/New_York';
  END IF;

  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS tg_contacts_autofill_timezone ON public.contacts;
CREATE TRIGGER tg_contacts_autofill_timezone
  BEFORE INSERT OR UPDATE OF phone, cell_phone, timezone
  ON public.contacts
  FOR EACH ROW
  EXECUTE FUNCTION fn_contacts_autofill_timezone();
