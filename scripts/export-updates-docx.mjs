import fs from 'node:fs'
import path from 'node:path'
import {
  Document,
  HeadingLevel,
  Packer,
  Paragraph,
  TextRun,
} from 'docx'

function mdToParagraphs(md) {
  const paras = []
  const lines = md.replace(/\r\n/g, '\n').replace(/\r/g, '\n').split('\n')

  for (const rawLine of lines) {
    const line = rawLine.trimEnd()
    if (line.trim().length === 0) {
      paras.push(new Paragraph({}))
      continue
    }

    const h2 = line.match(/^##\s+(.*)$/)
    if (h2) {
      paras.push(
        new Paragraph({
          text: h2[1],
          heading: HeadingLevel.HEADING_1,
        })
      )
      continue
    }

    const h3 = line.match(/^###\s+(.*)$/)
    if (h3) {
      paras.push(
        new Paragraph({
          text: h3[1],
          heading: HeadingLevel.HEADING_2,
        })
      )
      continue
    }

    const h4 = line.match(/^####\s+(.*)$/)
    if (h4) {
      paras.push(
        new Paragraph({
          text: h4[1],
          heading: HeadingLevel.HEADING_3,
        })
      )
      continue
    }

    const bullet = line.match(/^- (.*)$/)
    if (bullet) {
      paras.push(
        new Paragraph({
          children: [new TextRun(bullet[1])],
          bullet: { level: 0 },
        })
      )
      continue
    }

    const subBullet = line.match(/^\s{2,}- (.*)$/)
    if (subBullet) {
      paras.push(
        new Paragraph({
          children: [new TextRun(subBullet[1])],
          bullet: { level: 1 },
        })
      )
      continue
    }

    paras.push(
      new Paragraph({
        children: [new TextRun(line)],
      })
    )
  }

  return paras
}

async function main() {
  const root = process.cwd()
  const inputPath = path.join(root, 'reports', 'indobase-updates-2026-05.md')
  const outputPath = path.join(root, 'reports', 'indobase-updates-2026-04-to-2026-05.docx')

  const md = fs.readFileSync(inputPath, 'utf8')
  const doc = new Document({
    sections: [
      {
        properties: {},
        children: mdToParagraphs(md),
      },
    ],
  })

  const buf = await Packer.toBuffer(doc)
  fs.writeFileSync(outputPath, buf)

  // eslint-disable-next-line no-console
  console.log(`Wrote ${outputPath}`)
}

main().catch((err) => {
  // eslint-disable-next-line no-console
  console.error(err)
  process.exit(1)
})

