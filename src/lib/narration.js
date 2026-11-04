const SMALL = [
  "zero", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine",
  "ten", "eleven", "twelve", "thirteen", "fourteen", "fifteen", "sixteen",
  "seventeen", "eighteen", "nineteen"
];
const TENS = ["", "", "twenty", "thirty", "forty", "fifty", "sixty", "seventy", "eighty", "ninety"];
const ORDINAL_SMALL = [
  "zeroth", "first", "second", "third", "fourth", "fifth", "sixth", "seventh",
  "eighth", "ninth", "tenth", "eleventh", "twelfth", "thirteenth", "fourteenth",
  "fifteenth", "sixteenth", "seventeenth", "eighteenth", "nineteenth"
];
const ORDINAL_TENS = ["", "", "twentieth", "thirtieth", "fortieth", "fiftieth", "sixtieth", "seventieth", "eightieth", "ninetieth"];
const MONTH_LIST = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
const MONTHS = {
  jan: "January", january: "January", feb: "February", february: "February",
  mar: "March", march: "March", apr: "April", april: "April", may: "May",
  jun: "June", june: "June", jul: "July", july: "July", aug: "August", august: "August",
  sep: "September", sept: "September", september: "September",
  oct: "October", october: "October", nov: "November", november: "November",
  dec: "December", december: "December"
};
const MONTH_PATTERN = "(?:January|February|March|April|May|June|July|August|September|October|November|December|Jan|Feb|Mar|Apr|Jun|Jul|Aug|Sep|Sept|Oct|Nov|Dec)";
const CURRENCIES = {
  "$": { major: "dollar", minor: "cent" },
  "£": { major: "pound", minor: "penny" },
  "€": { major: "euro", minor: "cent" },
  "₹": { major: "rupee", minor: "paisa" },
  USD: { major: "dollar", minor: "cent" },
  GBP: { major: "pound", minor: "penny" },
  EUR: { major: "euro", minor: "cent" },
  INR: { major: "rupee", minor: "paisa" }
};
const UNITS = {
  "km/h": ["kilometer per hour", "kilometers per hour"],
  "m/s": ["meter per second", "meters per second"],
  "°c": ["degree Celsius", "degrees Celsius"],
  "°f": ["degree Fahrenheit", "degrees Fahrenheit"],
  kg: ["kilogram", "kilograms"], mg: ["milligram", "milligrams"],
  gb: ["gigabyte", "gigabytes"], mb: ["megabyte", "megabytes"], tb: ["terabyte", "terabytes"],
  ghz: ["gigahertz", "gigahertz"], mhz: ["megahertz", "megahertz"],
  mph: ["mile per hour", "miles per hour"], kph: ["kilometer per hour", "kilometers per hour"],
  km: ["kilometer", "kilometers"], cm: ["centimeter", "centimeters"], mm: ["millimeter", "millimeters"],
  lb: ["pound", "pounds"], lbs: ["pound", "pounds"], oz: ["ounce", "ounces"],
  ft: ["foot", "feet"], feet: ["foot", "feet"], foot: ["foot", "feet"],
  inch: ["inch", "inches"], inches: ["inch", "inches"], in: ["inch", "inches"],
  sec: ["second", "seconds"], secs: ["second", "seconds"], s: ["second", "seconds"],
  ms: ["millisecond", "milliseconds"], min: ["minute", "minutes"], mins: ["minute", "minutes"],
  hr: ["hour", "hours"], hrs: ["hour", "hours"], h: ["hour", "hours"],
  day: ["day", "days"], days: ["day", "days"], week: ["week", "weeks"], weeks: ["week", "weeks"],
  m: ["meter", "meters"], g: ["gram", "grams"]
};
const ACRONYMS = [
  ["AI", "A I"], ["API", "A P I"], ["URL", "U R L"], ["HTML", "H T M L"],
  ["CSS", "C S S"], ["SEO", "S E O"], ["CPU", "C P U"], ["GPU", "G P U"],
  ["USB", "U S B"], ["PDF", "P D F"], ["FAQ", "F A Q"], ["GPS", "G P S"],
  ["SMS", "S M S"], ["VPN", "V P N"], ["UI", "U I"], ["UX", "U X"], ["CEO", "C E O"]
];

function underHundred(value) {
  if (value < 20) return SMALL[value];
  const tens = Math.floor(value / 10);
  const remainder = value % 10;
  return TENS[tens] + (remainder ? " " + SMALL[remainder] : "");
}

function integerToWords(value) {
  if (!Number.isSafeInteger(value) || value < 0 || value > 999999999999) return String(value);
  if (value < 100) return underHundred(value);
  if (value < 1000) {
    const hundreds = Math.floor(value / 100);
    const remainder = value % 100;
    return SMALL[hundreds] + " hundred" + (remainder ? " and " + underHundred(remainder) : "");
  }
  const scales = [[1000000000, "billion"], [1000000, "million"], [1000, "thousand"]];
  for (const [scale, label] of scales) {
    if (value >= scale) {
      const head = Math.floor(value / scale);
      const remainder = value % scale;
      return integerToWords(head) + " " + label + (remainder ? " " + integerToWords(remainder) : "");
    }
  }
  return String(value);
}

function numberToWords(raw) {
  const normalized = String(raw).replace(/,/g, "");
  if (!/^\d+(?:\.\d+)?$/.test(normalized)) return raw;
  const parts = normalized.split(".");
  const whole = Number(parts[0]);
  if (!Number.isSafeInteger(whole) || whole > 999999999999) return raw;
  let result = integerToWords(whole);
  if (parts.length > 1) {
    result += " point " + [...parts[1]].map(digit => SMALL[Number(digit)]).join(" ");
  }
  return result;
}

function yearToWords(rawYear) {
  const year = Number(rawYear);
  if (year < 1900 || year > 2099) return numberToWords(rawYear);
  if (year === 2000) return "two thousand";
  if (year >= 2001 && year <= 2009) return "two thousand " + underHundred(year - 2000);
  if (year >= 2010) return "twenty " + underHundred(year - 2000);
  if (year === 1900) return "nineteen hundred";
  const remainder = year - 1900;
  return "nineteen " + (remainder < 10 ? "oh " : "") + underHundred(remainder);
}

function ordinalToWords(value) {
  if (value < 20) return ORDINAL_SMALL[value];
  const tens = Math.floor(value / 10);
  const remainder = value % 10;
  return remainder ? TENS[tens] + " " + ORDINAL_SMALL[remainder] : ORDINAL_TENS[tens];
}

function monthName(raw) {
  return MONTHS[raw.toLowerCase().replace(/\.$/, "")] || raw;
}

function validDate(year, month, day) {
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
}

function monthNumber(name) {
  return MONTH_LIST.indexOf(monthName(name)) + 1;
}

function normalizeDates(text) {
  let result = text.replace(/\b((?:19|20)\d{2})-(\d{1,2})-(\d{1,2})\b/g, (whole, year, month, day) => {
    const y = Number(year), m = Number(month), d = Number(day);
    return validDate(y, m, d) ? MONTH_LIST[m - 1] + " " + ordinalToWords(d) + ", " + yearToWords(year) : whole;
  });

  const monthFirst = new RegExp("\\b(" + MONTH_PATTERN + ")\\.?\\s+(\\d{1,2})(?:st|nd|rd|th)?(?:,?\\s+((?:19|20)\\d{2}))?\\b", "gi");
  result = result.replace(monthFirst, (whole, month, day, year) => {
    const m = monthNumber(month), d = Number(day);
    if (!m || d < 1 || d > 31) return whole;
    return monthName(month) + " " + ordinalToWords(d) + (year ? ", " + yearToWords(year) : "");
  });

  const dayFirst = new RegExp("\\b(\\d{1,2})(?:st|nd|rd|th)?\\s+(" + MONTH_PATTERN + ")\\.?(?:,?\\s+((?:19|20)\\d{2}))?\\b", "gi");
  result = result.replace(dayFirst, (whole, day, month, year) => {
    const m = monthNumber(month), d = Number(day);
    if (!m || d < 1 || d > 31) return whole;
    return ordinalToWords(d) + " of " + monthName(month) + (year ? ", " + yearToWords(year) : "");
  });
  return result;
}

function currencyWords(code, rawAmount) {
  const currency = CURRENCIES[code];
  if (!currency) return rawAmount;
  const amountParts = rawAmount.replace(/,/g, "").split(".");
  const whole = Number(amountParts[0]);
  if (!Number.isSafeInteger(whole) || whole > 999999999999) return rawAmount;
  const minor = amountParts.length > 1 ? Number((amountParts[1] + "00").slice(0, 2)) : 0;
  const parts = [];
  if (whole > 0 || minor === 0) {
    parts.push(integerToWords(whole) + " " + currency.major + (whole === 1 ? "" : "s"));
  }
  if (minor > 0) {
    const minorName = currency.minor === "penny" ? (minor === 1 ? "penny" : "pence") : currency.minor + (minor === 1 ? "" : "s");
    parts.push(integerToWords(minor) + " " + minorName);
  }
  return parts.join(" and ");
}

function normalizeCurrencies(text) {
  let result = text.replace(/([$£€₹])\s*(\d+(?:,\d{2,3})*(?:\.\d{1,2})?)/g, (whole, symbol, amount) =>
    currencyWords(symbol, amount)
  );
  result = result.replace(/\b(USD|GBP|EUR|INR)\s*(\d+(?:,\d{2,3})*(?:\.\d{1,2})?)/gi, (whole, code, amount) =>
    currencyWords(code.toUpperCase(), amount)
  );
  result = result.replace(/(\d+(?:,\d{2,3})*(?:\.\d{1,2})?)\s*(USD|GBP|EUR|INR)\b/gi, (whole, amount, code) =>
    currencyWords(code.toUpperCase(), amount)
  );
  return result;
}

function normalizeTimes(text) {
  return text.replace(/\b(0?[1-9]|1[0-2]):([0-5]\d)\s*(a\.m\.|p\.m\.|am|pm)\b/gi, (whole, hourText, minuteText, suffix) => {
    const hour = Number(hourText);
    const minute = Number(minuteText);
    const period = suffix.toLowerCase().startsWith("a") ? "in the morning" : "in the afternoon";
    if (hour === 12 && minute === 0) return period === "in the morning" ? "midnight" : "noon";
    const minuteWords = minute === 0 ? "" : minute < 10 ? " oh " + SMALL[minute] : " " + underHundred(minute);
    return SMALL[hour] + minuteWords + (minute === 0 ? "" : " ") + period;
  });
}

function normalizePercentages(text) {
  return text.replace(/\b(\d+(?:,\d{2,3})*(?:\.\d+)?)\s*%/g, (_whole, number) =>
    numberToWords(number) + " percent"
  );
}

function normalizeMeasurements(text) {
  const aliases = Object.keys(UNITS).sort((a, b) => b.length - a.length)
    .map(unit => unit.replace(/[|\\{}()[\]^$+*?.-]/g, "\\$&"));
  const pattern = new RegExp("\\b(\\d+(?:\\.\\d+)?)\\s*(" + aliases.join("|") + ")(?![A-Za-z])", "gi");
  return text.replace(pattern, (whole, rawNumber, rawUnit) => {
    const unit = UNITS[rawUnit.toLowerCase()];
    const quantity = Number(rawNumber);
    const spokenNumber = numberToWords(rawNumber);
    return spokenNumber + " " + unit[quantity === 1 ? 0 : 1];
  });
}

function normalizeOrdinals(text) {
  return text.replace(/\b(\d{1,2})(st|nd|rd|th)\b/gi, (_whole, raw) => ordinalToWords(Number(raw)));
}

function normalizeBareNumbers(text) {
  return text.replace(/(?<![\p{L}\p{N}_+#(.\-\/])((?:\d{1,3}(?:,\d{3})+|\d{1,6})(?:\.\d+)?)(?![\p{L}\p{N}_\.\/:-])/gu, (whole, number) => {
    if (/^0\d/.test(number.replace(/,/g, ""))) return whole;
    const plain = number.replace(/,/g, "");
    if (/^(?:19|20)\d{2}$/.test(plain)) return yearToWords(plain);
    return numberToWords(number);
  });
}

function normalizeAbbreviations(text) {
  let result = text
    .replace(/\be\.g\.(?=\s|$)/gi, "for example")
    .replace(/\bi\.e\.(?=\s|$)/gi, "that is")
    .replace(/\bvs\.(?=\s|$)/gi, "versus")
    .replace(/\betc\.(?=\s|$)/gi, "and so on")
    .replace(/\bMr\.(?=\s)/g, "Mister")
    .replace(/\bMrs\.(?=\s)/g, "Missus")
    .replace(/\bDr\.(?=\s)/g, "Doctor")
    .replace(/\bMs\.(?=\s)/g, "Miz");
  for (const [source, replacement] of ACRONYMS) {
    result = result.replace(new RegExp("\\b" + source + "\\b", "g"), replacement);
  }
  return result;
}

export function splitNarrationSections(text) {
  return String(text ?? "").replace(/\r\n?/g, "\n")
    .split(/\n\s*\n+/)
    .map(section => section.replace(/\s+/g, " ").trim())
    .filter(Boolean);
}

export function prepareNarrationText(text) {
  let result = String(text ?? "").replace(/\r\n?/g, "\n");
  result = normalizeAbbreviations(result);
  result = normalizeDates(result);
  result = normalizeTimes(result);
  result = normalizeCurrencies(result);
  result = normalizeMeasurements(result);
  result = normalizePercentages(result);
  result = normalizeOrdinals(result);
  result = normalizeBareNumbers(result);
  return result;
}
