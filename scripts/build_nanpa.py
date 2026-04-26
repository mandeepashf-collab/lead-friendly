"""
Build nanpa-timezones.json from authoritative area code -> state list.

Source: Wikipedia List of NANP area codes (by-state index), verified Apr 2026.
Timezone mapping: IANA zones per state, with documented exceptions for
split-timezone states (Florida, Kentucky, Nebraska, Tennessee, Texas).

For split-state area codes we pick the dominant timezone (where the
majority of the area code's population lives). Edge cases are noted
in comments and can be overridden per-contact by setting contacts.timezone
explicitly — the NANPA lookup is only a fallback when contact.timezone is NULL.

Output: src/lib/phone/nanpa-timezones.json
"""

import json
from pathlib import Path

STATE_TZ = {
    "AL": "America/Chicago", "AK": "America/Anchorage", "AZ": "America/Phoenix",
    "AR": "America/Chicago", "CA": "America/Los_Angeles", "CO": "America/Denver",
    "CT": "America/New_York", "DE": "America/New_York", "DC": "America/New_York",
    "FL": "America/New_York", "GA": "America/New_York", "HI": "Pacific/Honolulu",
    "ID": "America/Boise", "IL": "America/Chicago",
    "IN": "America/Indiana/Indianapolis", "IA": "America/Chicago",
    "KS": "America/Chicago", "KY": "America/New_York", "LA": "America/Chicago",
    "ME": "America/New_York", "MD": "America/New_York", "MA": "America/New_York",
    "MI": "America/Detroit", "MN": "America/Chicago", "MS": "America/Chicago",
    "MO": "America/Chicago", "MT": "America/Denver", "NE": "America/Chicago",
    "NV": "America/Los_Angeles", "NH": "America/New_York", "NJ": "America/New_York",
    "NM": "America/Denver", "NY": "America/New_York", "NC": "America/New_York",
    "ND": "America/Chicago", "OH": "America/New_York", "OK": "America/Chicago",
    "OR": "America/Los_Angeles", "PA": "America/New_York", "RI": "America/New_York",
    "SC": "America/New_York", "SD": "America/Chicago", "TN": "America/Chicago",
    "TX": "America/Chicago", "UT": "America/Denver", "VT": "America/New_York",
    "VA": "America/New_York", "WA": "America/Los_Angeles", "WV": "America/New_York",
    "WI": "America/Chicago", "WY": "America/Denver",
    "PR": "America/Puerto_Rico", "VI": "America/St_Thomas",
    "GU": "Pacific/Guam", "MP": "Pacific/Saipan", "AS": "Pacific/Pago_Pago",
}

PROVINCE_TZ = {
    "AB": "America/Edmonton", "BC": "America/Vancouver", "MB": "America/Winnipeg",
    "NB": "America/Moncton", "NL": "America/St_Johns", "NT": "America/Yellowknife",
    "NS": "America/Halifax", "NU": "America/Iqaluit", "ON": "America/Toronto",
    "PE": "America/Halifax", "QC": "America/Montreal", "SK": "America/Regina",
    "YT": "America/Whitehorse",
}

US_STATE_CODES = {
    "AL": ["205", "251", "256", "334", "483", "659", "938"],
    "AK": ["907"],
    "AZ": ["480", "520", "602", "623", "928"],
    "AR": ["327", "479", "501", "870"],
    "CA": ["209", "213", "279", "310", "323", "341", "350", "357", "369",
           "408", "415", "424", "442", "510", "530", "559", "562", "619",
           "626", "628", "650", "657", "661", "669", "707", "714", "738",
           "747", "760", "805", "818", "820", "831", "837", "840", "858",
           "909", "916", "925", "949", "951"],
    "CO": ["303", "719", "720", "748", "970", "983"],
    "CT": ["203", "475", "860", "959"],
    "DE": ["302"],
    "DC": ["202", "771"],
    "FL": ["239", "305", "321", "324", "352", "386", "407", "448", "561",
           "645", "656", "689", "727", "728", "754", "772", "786", "813",
           "850", "863", "904", "941", "954"],
    "GA": ["229", "404", "470", "478", "678", "706", "762", "770", "912", "943"],
    "HI": ["808"],
    "ID": ["208", "986"],
    "IL": ["217", "224", "309", "312", "331", "447", "464", "618", "630",
           "708", "730", "773", "779", "815", "847", "861", "872"],
    "IN": ["219", "260", "317", "463", "574", "765", "812", "930"],
    "IA": ["319", "515", "563", "641", "712"],
    "KS": ["316", "620", "785", "913"],
    "KY": ["270", "364", "502", "606", "859"],
    "LA": ["225", "318", "337", "457", "504", "985"],
    "ME": ["207"],
    "MD": ["227", "240", "301", "410", "443", "667"],
    "MA": ["339", "351", "413", "508", "617", "774", "781", "857", "978"],
    "MI": ["231", "248", "269", "313", "517", "586", "616", "679", "734",
           "810", "906", "947", "989"],
    "MN": ["218", "320", "507", "612", "651", "763", "924", "952"],
    "MS": ["228", "471", "601", "662", "769"],
    "MO": ["235", "314", "417", "557", "573", "636", "660", "816", "975"],
    "MT": ["406"],
    "NE": ["308", "402", "531"],
    "NV": ["702", "725", "775"],
    "NH": ["603"],
    "NJ": ["201", "551", "609", "640", "732", "848", "856", "862", "908", "973"],
    "NM": ["505", "575"],
    "NY": ["212", "315", "329", "332", "347", "363", "516", "518", "585",
           "607", "624", "631", "646", "680", "716", "718", "838", "845",
           "914", "917", "929", "934"],
    "NC": ["252", "336", "472", "704", "743", "828", "910", "919", "980", "984"],
    "ND": ["701"],
    "OH": ["216", "220", "234", "283", "326", "330", "380", "419", "436",
           "440", "513", "567", "614", "740", "937"],
    "OK": ["405", "539", "572", "580", "918"],
    "OR": ["458", "503", "541", "971"],
    "PA": ["215", "223", "267", "272", "412", "445", "484", "570", "582",
           "610", "717", "724", "814", "835", "878"],
    "RI": ["401"],
    "SC": ["803", "821", "839", "843", "854", "864"],
    "SD": ["605"],
    "TN": ["423", "615", "629", "729", "731", "865", "901", "931"],
    "TX": ["210", "214", "254", "281", "325", "346", "361", "409", "430",
           "432", "469", "512", "621", "682", "713", "726", "737", "806",
           "817", "830", "832", "903", "915", "936", "940", "945", "956",
           "972", "979"],
    "UT": ["385", "435", "801"],
    "VT": ["802"],
    "VA": ["276", "434", "540", "571", "686", "703", "757", "804", "826", "948"],
    "WA": ["206", "253", "360", "425", "509", "564"],
    "WV": ["304", "681"],
    "WI": ["262", "274", "353", "414", "534", "608", "715", "920"],
    "WY": ["307"],
}

CA_PROVINCE_CODES = {
    "AB": ["368", "403", "568", "587", "780", "825"],
    "BC": ["236", "250", "257", "604", "672", "778"],
    "MB": ["204", "431", "584"],
    "NB": ["428", "506"],
    "NL": ["709", "879"],
    "NS": ["782", "902"],
    "ON": ["226", "249", "289", "343", "365", "382", "416", "437", "519",
           "548", "613", "647", "683", "705", "742", "753", "807", "905",
           "942"],
    "QC": ["263", "354", "367", "418", "438", "450", "468", "514", "579",
           "581", "819", "873"],
    "SK": ["306", "474", "639"],
    "YT": ["867"],
}

SHARED_CODES = {
    "867": {"states": ["YT", "NT", "NU"], "primary": "YT"},
    "782": {"states": ["NS", "PE"], "primary": "NS"},
    "902": {"states": ["NS", "PE"], "primary": "NS"},
    "851": {"states": ["NS", "PE"], "primary": "NS"},
}

# Per-area-code timezone overrides for split-TZ states
AREA_CODE_TZ_OVERRIDES = {
    # Florida panhandle (Central)
    "850": "America/Chicago",
    "448": "America/Chicago",
    # Tennessee east (Eastern)
    "423": "America/New_York",
    "865": "America/New_York",
    "729": "America/New_York",
    # Texas El Paso (Mountain)
    "915": "America/Denver",
    # Western Kentucky (Central)
    "270": "America/Chicago",
    "364": "America/Chicago",
    # Western Nebraska (Mountain)
    "308": "America/Denver",
}

TZ_LABELS = {
    "America/New_York": "Eastern", "America/Chicago": "Central",
    "America/Denver": "Mountain", "America/Phoenix": "Mountain (no DST)",
    "America/Los_Angeles": "Pacific", "America/Anchorage": "Alaska",
    "America/Boise": "Mountain", "America/Detroit": "Eastern",
    "America/Indiana/Indianapolis": "Eastern", "Pacific/Honolulu": "Hawaii (no DST)",
    "America/Puerto_Rico": "Atlantic", "America/St_Thomas": "Atlantic",
    "Pacific/Guam": "Chamorro", "Pacific/Saipan": "Chamorro",
    "Pacific/Pago_Pago": "Samoa", "America/Edmonton": "Mountain",
    "America/Vancouver": "Pacific", "America/Winnipeg": "Central",
    "America/Moncton": "Atlantic", "America/St_Johns": "Newfoundland",
    "America/Yellowknife": "Mountain", "America/Iqaluit": "Eastern",
    "America/Toronto": "Eastern", "America/Halifax": "Atlantic",
    "America/Montreal": "Eastern", "America/Regina": "Central (no DST)",
    "America/Whitehorse": "Yukon",
}


def build():
    out = {}
    for state, codes in US_STATE_CODES.items():
        default_tz = STATE_TZ[state]
        for code in codes:
            tz = AREA_CODE_TZ_OVERRIDES.get(code, default_tz)
            out[code] = {"state": state, "country": "US", "tz": tz,
                         "label": TZ_LABELS.get(tz, tz)}
    for province, codes in CA_PROVINCE_CODES.items():
        default_tz = PROVINCE_TZ[province]
        for code in codes:
            if code in out and code not in SHARED_CODES:
                continue
            tz = AREA_CODE_TZ_OVERRIDES.get(code, default_tz)
            out[code] = {"state": province, "country": "CA", "tz": tz,
                         "label": TZ_LABELS.get(tz, tz)}
    for code, info in SHARED_CODES.items():
        if code in out:
            out[code]["shared_with"] = info["states"]
    return out


if __name__ == "__main__":
    data = build()
    out_path = Path(__file__).parent.parent / "src" / "lib" / "phone" / "nanpa-timezones.json"
    out_path.parent.mkdir(parents=True, exist_ok=True)
    out_path.write_text(json.dumps(data, indent=2, sort_keys=True))
    print(f"Written: {out_path} ({out_path.stat().st_size} bytes)")
    print(f"Total area codes: {len(data)}")
    # Spot checks
    for code in ["425", "212", "415", "850", "915", "423", "808"]:
        print(f"  {code} -> {data.get(code)}")
