const fs = require("fs");
const path = require("path-extra");
const lojban = require("lojban");
const GoogleSpreadsheet = require("google-spreadsheet");

const doc = new GoogleSpreadsheet(
  "1Md0pojdcO3EVf3LQPHXFB7uOThNvTWszkWd5T4YhvKs"
);
let sheet;
doc.getInfo((err, info) => {
  sheet = info.worksheets[0];

  sheet.getRows(
    {
      //   offset: 0,
      //   limit: 1
    },
    (err, rows) => {
      console.log(`${rows.length} rows in the file. Begin processing ...`);
      processRows(rows);
    }
  );
});

function processRows(rows) {
  let n = [];
  for (const r of rows) {
    let j;
    const tags = r.ilmenstags + r.glekistags + r.uakcisoptionalnewtags;
    if (tags.indexOf("B") === -1) {
      j = {
        source: r.tatoebaenglish,
        target:
          r.glekisalternativeproposal ||
          r.ilmensalternativeproposal ||
          r.uakcisrevision ||
          r.jelcaproposal ||
          r.tatoebalojban
      };
      try {
        j.target = lojban.zeizei(
          j.target.replace(/ĭ/g, "i").replace(/ŭ/g, "u")
        );
      } catch (error) {
        console.log(error);
      }
    }
    if (j && j.target !== "" && j.target.indexOf("zoi") === -1) {
      j.target = j.target
        .replace(/\./g, "")
        .replace(/ {2,}/g, " ")
        .trim();
      n.push(j);
    }
  }
  console.log(n.length);
  let tsv = n
    .map(r => {
      return `${r.source}\t${r.target}`;
    })
    .join("\n");
  fs.writeFileSync("./ej.tsv", tsv);
  tsv = n
    .map(r => {
      return `${r.target}\t${r.source}`;
    })
    .join("\n");
  fs.writeFileSync("./je.tsv", tsv);
}
