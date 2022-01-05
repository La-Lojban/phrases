require('dotenv').config()
const fs = require("fs");
const path = require("path");
const lojban = require("lojban");
const { GoogleSpreadsheet } = require("google-spreadsheet");

const doc = new GoogleSpreadsheet(
  "1Md0pojdcO3EVf3LQPHXFB7uOThNvTWszkWd5T4YhvKs"
);
if (!process.env.KEY) console.log('muplis update cancelled, no KEY specified');
doc.useApiKey(process.env.KEY);
(async () => {
  await doc.loadInfo();
  const sheet = doc.sheetsById[551499663];
  
  
  let output = {
    en2jb: [],
    jb2en: []
  };
  
  const limit = 10000;
  for (let offset = 0; offset < 92000; offset += limit) {
    try {
      const rows = await sheet.getRows(
        {
          offset,
          limit
        })
      const { jb2en, en2jb } = processRows(rows);
      output.jb2en = output.jb2en.concat(jb2en);
      output.en2jb = output.en2jb.concat(en2jb);
    } catch (error) {
      console.log(error.response.data); 
      continue
    }
  }

  console.log(`writing to output...`);
  createDexieCacheFile(output.jb2en)
  output.jb2en = output.jb2en
    .map(i => `${i.source}\t${i.target}\t${i.tags.join(" ")}`)
    .join("\n")
    .replace(/[\r\n]{2,}/g, "\n");
  output.en2jb = output.en2jb
    .map(i => `${i.source}\t${i.target}\t${i.tags}`)
    .join("\n")
    .replace(/[\r\n]{2,}/g, "\n");
  fs.writeFileSync(path.join(__dirname, "./dist/jb2en.tsv"), output.jb2en);
  fs.writeFileSync(path.join(__dirname, "./dist/en2jb.tsv"), output.en2jb);

})()

function createDexieCacheFile(arr) {
  const a = arr.map(i => {
    let cache = `${i.source};${i.source.replace(/h/g, "'")};${i.source_opt};${(i.source_opt || '').replace(/h/g, "'")};${i.target.replace(/[\.,!?\/\\]/g, '').replace(/[h‘]/g, "'")};`
    const cache1 = cache
      .toLowerCase()
      .replace(/ /g, ';')
      .split(';')
      .map((i) => i.trim())
      .filter((i) => i !== '')
    let cache2 = cache
      .toLowerCase()
      .replace(
        /[ \u2000-\u206F\u2E00-\u2E7F\\!"#$%&()*+,\-.\/:<=>?@\[\]^`{|}~：？。，《》「」『』－（）]/g,
        ';'
      )
      .split(';')
      .map((i) => i.trim())
      .filter((i) => i !== '')
    cache = cache1.concat(cache2)
    cache = [...new Set(cache)]
    const outRow = { w: i.source, bangu: 'muplis', d: i.target, cache }
    if (i.tags.length > 0) outRow.s = i.tags
    return outRow
  })
  splitOutput(a)
}

function canonicalizeValsi(valsi) {
  if (/^[aeiouy]/.test(valsi)) valsi = "." + valsi
  if (/y$/.test(valsi) && valsi.indexOf(".") !== 0) valsi = valsi + "."
  if (/[^aeiouy]$/.test(valsi)) valsi = "." + valsi + "."  
  return valsi.replace(/\.\./g,'.')
}

function processRows(rows) {
  let n = [];
  for (const r of rows) {
    if (r._rowNumber % 100 === 0) console.log(`processing row ${r._rowNumber}`)
    let j;
    const tags = (r["Ilmen's tags"] || '') + (r["gleki's tags"] || '') + (r["uakci's optional new tags"] || '');
    j = {
      source: r['Tatoeba: English'] || "",
      target:
        r['gleki\'s alternative proposal'] ||
        r['Ilmen\'s alternative proposal'] ||
        r['uakci\'s revision'] ||
        r['jelca proposal'] ||
        r['Tatoeba: Lojban'] ||
        "",
      tags: r["gleki's tags"] || r["Ilmen's tags"] || r["uakci's optional new tags"] || ''
    };

    if ((tags.indexOf("B") >= 0 && j.target === r['Tatoeba: Lojban']) || (r['Tatoeba: Lojban'] || '') === '' || (r['Tatoeba: English'] || '') === '') continue;
    j.target = lojban.preprocessing(j.target.toLowerCase())

    try {
      j.target_opt = lojban.romoi_lahi_cmaxes(lojban.zeizei(j.target.replace(/ĭ/g, "i")
        .replace(/ŭ/g, "u")), 'T').kampu.filter(i => i[0] !== 'drata').map(i => i[1]).join(" ").replace(/-/g, '');
    } catch (error) {
      continue;
    }

    j.source = j.source
      .replace(/ {2,}/g, " ")
      .replace(/[\r\n]/g, "")
      .replace(/’/g, "'")
      .trim();
    if (
      j.source !== "" &&
      j.target !== "" &&
      j.target.search(/\bzoi\b/) === -1
    ) {
      try {
        const parsed = lojban.romoi_lahi_cmaxes(j.target)
        if (parsed.tcini == 'fliba') continue
        j.target = parsed.kampu.filter(i => i[0] !== 'drata').map(i => canonicalizeValsi(i[1])).join(" ").replace(/-/g, '')
        if (!j.target.split(" ").includes("zei")) j.target_opt = j.target_opt.split(" ").filter(i => i !== 'zei').join(" ")
      } catch (error) {
        console.log(error);
      }
      n = duplicator({ n, j });
    }
  }

  let en2jb = n.map(r => {
    const outRow = { source: r.source, target: r.target, tags: r.tags }
    return outRow;
  });
  en2jb = [...new Set(en2jb.map(el => JSON.stringify(el)))].map(el => JSON.parse(el))
  let jb2en = n.map(r => {
    // Or this is what la Ilmen uses: G (good), G− (a little good, not so good), G+ (very good), A (acceptable), B[−+] ([a little / very] bad), N (neologism, containing an undocumented Lojban word), E (experimental grammar), P (non-conventional punctuation), C - CLL style, X - xorlo. W - play on words and thus poorly translatable to/from Lojban
    r.tags = r.tags.replace(/ /g, '').split(/[A-Z][\+\-]?/).filter(i => i !== '').map(i => {
      i = i
        .replace(/^G\-$/, '👍')
        .replace(/^G$/, '👍👍')
        .replace(/^G\+$/, '👍👍👍')
        .replace(/^A$/, '😐')
        .replace(/^B-$/, '👎')
        .replace(/^B$/, '👎👎')
        .replace(/^B\+$/, '👎👎👎')
        .replace(/^N$/, '👒')
        .replace(/^E$/, '🧪')
        .replace(/^P$/, '🎗')
        .replace(/^C$/, '📕')
        .replace(/^X$/, 'xorlo')
        .replace(/^W$/, 'trokadilo')
      return i
    })
    const outRow = { source: r.target, source_opt: r.target_opt, target: r.source, tags: r.tags }
    return outRow;
  });
  jb2en = [...new Set(jb2en.map(el => JSON.stringify(el)))].map(el => JSON.parse(el))

  return { jb2en, en2jb };
}

function duplicator({ n, j }) {
  j.target = j.target
    .replace(/\bmeris\b/g, "maris")
    .replace(/\btokion\b/g, "tokios")
    .replace(/\ble\b/g, "lo")
    .replace(/\blei\b/g, "loi");
  n.push(j);
  if (j.source.search(/\bTom\b/) >= 0) {
    j2 = JSON.parse(JSON.stringify(j));
    j2.source = j2.source.replace(/\bTom\b/g, "Alice");
    j2.target = j2.target.replace(/\btom\b/g, "alis");
    j2.target = j2.target.replace(/\btam\b/g, "alis");
    n = n.concat(j2);

    j2 = JSON.parse(JSON.stringify(j));
    j2.source = j2.source.replace(/\bTom\b/g, "Mary");
    j2.target = j2.target.replace(/\btom\b/g, "maris");
    j2.target = j2.target.replace(/\btam\b/g, "maris");
    n = n.concat(j2);
  }
  if (j.source.search(/\bapples?\b/) >= 0) {
    j2 = JSON.parse(JSON.stringify(j));
    j2.source = j2.source.replace(/\bapple\b/g, "pear");
    j2.source = j2.source.replace(/\bapples\b/g, "pears");
    j2.target = j2.target.replace(/\bplise\b/g, "perli");
    n = n.concat(j2);
  }
  if (j.source.search(/\bOsaka\b/) >= 0) {
    j2 = JSON.parse(JSON.stringify(j));
    j2.source = j2.source.replace(/\bOsaka\b/g, "New York");
    j2.target = j2.target.replace(/\bosakan\b/g, "nuiork");
    n = n.concat(j2);
  }
  if (j.source.search(/\bTokio\b/) >= 0) {
    j2 = JSON.parse(JSON.stringify(j));
    j2.source = j2.source.replace(/\bTokio\b/g, "New York");
    j2.target = j2.target.replace(/\btokios\b/g, "nuiork");
    n = n.concat(j2);
  }
  return n;
}

function splitToChunks(array, parts) {
  let result = [];
  for (let i = parts; i > 0; i--) {
    result.push(array.splice(0, Math.ceil(array.length / i)));
  }
  return result;
}

function splitOutput(arr) {
  const tegerna = 'muplis'
  const hash = require('object-hash')(arr)

  splitToChunks(arr, 5).forEach((chunk, index) => {
    const outp = {
      formatName: 'dexie',
      formatVersion: 1,
      data: {
        databaseName: 'sorcu1',
        databaseVersion: 2,
        tables: [
          {
            name: 'valsi',
            schema: '++id, bangu, w, d, n, t, *s, g, *r, *cache, [r+bangu]',
            rowCount: chunk.length,
          },
        ],
        data: [
          {
            tableName: 'valsi',
            inbound: true,
            rows: chunk,
          },
        ],
      },
    }
    let dir = '/livla/build/sutysisku/data'
    dir = fs.existsSync(dir) ? dir : './dist'
    let pathBinDump = path.join(
      dir,
      `parsed-${tegerna}-${index}.bin`
    )
    fs.writeFileSync(path.join(
      dir,
      `parsed-${tegerna}-${index}.json`
    ), JSON.stringify(outp))
    const brotli = require('brotli-wasm');
    fs.writeFileSync(pathBinDump, brotli.compress(Buffer.from(JSON.stringify(outp))))
  })
  const versio = '/livla/build/sutysisku/data/versio.json'
  let jsonTimes = {}
  try {
    jsonTimes = JSON.parse(fs.readFileSync(versio, { encoding: 'utf8' }))
  } catch (error) { }
  jsonTimes[tegerna] = hash
  try {
    fs.writeFileSync(versio, JSON.stringify(jsonTimes))
  } catch (error) { }
}