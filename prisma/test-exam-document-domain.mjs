// Test harness for the exam/document domain migration (20260923143443_exam_document_domain).
// Runs against the real local PostgreSQL dev database — NOT a mock. Uses raw `pg`
// since the Prisma CLI/Client cannot be generated in this sandbox (see MIGRATIONS.md).
// Usage: node prisma/test-exam-document-domain.mjs
import pg from "pg";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const envPath = join(__dirname, "..", ".env.local");
let connectionString = process.env.DATABASE_URL;
try {
  const envContent = readFileSync(envPath, "utf8");
  const match = envContent.match(/^DATABASE_URL="?([^"\n]+)"?$/m);
  if (match) connectionString = match[1];
} catch {
  // fall back to process.env
}

const client = new pg.Client({ connectionString });
let passed = 0;
let failed = 0;

function report(name, ok, detail) {
  if (ok) {
    passed++;
    console.log(`  [PASSED] ${name}`);
  } else {
    failed++;
    console.log(`  [FAILED] ${name}${detail ? " — " + detail : ""}`);
  }
}

async function expectError(promise, matchStr, name) {
  try {
    await promise;
    report(name, false, "expected an error but none was thrown");
  } catch (err) {
    const ok = String(err.message).includes(matchStr);
    report(name, ok, ok ? undefined : `error did not match "${matchStr}": ${err.message}`);
  }
}

async function main() {
  await client.connect();
  console.log("Connected. Running exam/document domain tests...\n");

  // 1. Search by curriculum + level + subject (via exam_sets -> curriculum_level_subjects)
  {
    const { rows } = await client.query(
      `SELECT es.id, es.name
       FROM exam_sets es
       JOIN curriculum_level_subjects cls ON cls.id = es."curriculumLevelSubjectId"
       WHERE cls."curriculumId" = $1 AND cls."levelId" = $2 AND cls."subjectId" = $3`,
      ["cur_naktham_v1", "lvl_nt_tri", "subj_dhammavibhaga"]
    );
    report(
      "search exam_sets by curriculum+level+subject returns both seeded sets",
      rows.length === 2,
      `got ${rows.length} rows`
    );
  }

  // 2. Search by year (via exam_sets -> exam_sessions -> academic_years)
  // Note: asserts the expected row is a MEMBER of the result, not that it is the only
  // row for that year — prisma/seed.ts (a later, separate task) legitimately adds more
  // exam_sets for the same academic year (2568) as part of a fuller mock dataset, so an
  // exact-count-of-1 assertion here would be an assumption of test isolation that no
  // longer holds once real seed data exists alongside this migration's own demo rows.
  {
    const { rows } = await client.query(
      `SELECT es.id, es.name
       FROM exam_sets es
       JOIN exam_sessions sess ON sess.id = es."examSessionId"
       JOIN academic_years ay ON ay.id = sess."academicYearId"
       WHERE ay."yearBE" = $1`,
      [2568]
    );
    report(
      "search exam_sets by academic year (2568 BE) includes the official set",
      rows.some((r) => r.id === "xset_official_dhammavibhaga_tri_2568"),
      `got ${JSON.stringify(rows)}`
    );
  }

  // 3. Combined search: curriculum + level + subject + year in one query
  {
    const { rows } = await client.query(
      `SELECT es.id
       FROM exam_sets es
       JOIN curriculum_level_subjects cls ON cls.id = es."curriculumLevelSubjectId"
       LEFT JOIN exam_sessions sess ON sess.id = es."examSessionId"
       LEFT JOIN academic_years ay ON ay.id = sess."academicYearId"
       WHERE cls."curriculumId" = $1 AND cls."levelId" = $2 AND cls."subjectId" = $3
         AND (ay."yearBE" = $4 OR es."examSessionId" IS NULL)
       ORDER BY es.id`,
      ["cur_naktham_v1", "lvl_nt_tri", "subj_dhammavibhaga", 2568]
    );
    report(
      "combined curriculum+level+subject+year search returns both sets (practice=null-year + official=2568)",
      rows.length === 2,
      `got ${JSON.stringify(rows)}`
    );
  }

  // 4. Confirm the indexes needed for the curriculum/level/year/subject search path
  //    actually exist and are valid (queryable via pg_indexes + pg_index.indisvalid).
  //    Note on EXPLAIN: with only ~2 seed rows per table, Postgres' cost-based planner
  //    correctly prefers a Seq Scan over these indexes (a Seq Scan on 2 rows is cheaper
  //    than an Index Scan) — that is expected planner behavior, not a schema defect, so
  //    we assert the indexes exist/are valid rather than assert EXPLAIN chooses them.
  {
    const { rows: explainRows } = await client.query(
      `EXPLAIN SELECT * FROM exam_sets WHERE "curriculumLevelSubjectId" = 'cls_nt_tri_dhammavibhaga'`
    );
    console.log("    (EXPLAIN on tiny seed table, for reference — Seq Scan expected at this row count:)");
    console.log("    " + explainRows.map((r) => r["QUERY PLAN"]).join("\n    "));

    const { rows: validityRows } = await client.query(
      `SELECT c.relname AS indexname, i.indisvalid
       FROM pg_index i JOIN pg_class c ON c.oid = i.indexrelid
       WHERE c.relname IN (
         'exam_sets_curriculumLevelSubjectId_idx',
         'exam_sets_examSessionId_idx',
         'exam_sets_status_idx',
         'questions_subjectId_levelId_idx'
       )`
    );
    const allValid = validityRows.length === 4 && validityRows.every((r) => r.indisvalid === true);
    report(
      "all 4 search-path indexes exist and are valid (pg_index.indisvalid)",
      allValid,
      JSON.stringify(validityRows)
    );

    const { rows: idxRows } = await client.query(
      `SELECT indexname, indexdef FROM pg_indexes WHERE tablename = 'exam_sets' ORDER BY indexname`
    );
    const hasClsIdx = idxRows.some((r) => r.indexname === "exam_sets_curriculumLevelSubjectId_idx");
    const hasSessIdx = idxRows.some((r) => r.indexname === "exam_sets_examSessionId_idx");
    const hasStatusIdx = idxRows.some((r) => r.indexname === "exam_sets_status_idx");
    report(
      "exam_sets has curriculumLevelSubjectId, examSessionId, status indexes",
      hasClsIdx && hasSessIdx && hasStatusIdx,
      JSON.stringify(idxRows.map((r) => r.indexname))
    );
    const { rows: qIdxRows } = await client.query(
      `SELECT indexname FROM pg_indexes WHERE tablename = 'questions' ORDER BY indexname`
    );
    report(
      "questions has subjectId+levelId composite index",
      qIdxRows.some((r) => r.indexname === "questions_subjectId_levelId_idx"),
      JSON.stringify(qIdxRows.map((r) => r.indexname))
    );
  }

  // 5. Conditional immutability: DRAFT question_version can be freely edited
  {
    await client.query(`UPDATE "question_versions" SET "content" = $1 WHERE id = $2`, [
      "จงแต่งความเรียงแก้กระทู้ธรรม (แก้ไขระหว่าง DRAFT — มือกทดสอบ)",
      "qv_essay_001_v1",
    ]);
    const { rows } = await client.query(`SELECT content FROM question_versions WHERE id = $1`, [
      "qv_essay_001_v1",
    ]);
    report(
      "DRAFT question_version can be edited freely",
      rows[0].content.includes("แก้ไขระหว่าง DRAFT"),
      rows[0].content
    );
  }

  // 6. Conditional immutability: APPROVED question_version is locked (UPDATE blocked)
  await expectError(
    client.query(`UPDATE "question_versions" SET "content" = 'hacked' WHERE id = $1`, [
      "qv_dhammavibhaga_001_v1",
    ]),
    "is locked",
    "APPROVED question_version blocks UPDATE"
  );

  // 7. Conditional immutability: APPROVED question_version is locked (DELETE blocked)
  await expectError(
    client.query(`DELETE FROM "question_versions" WHERE id = $1`, ["qv_dhammavibhaga_001_v1"]),
    "is locked",
    "APPROVED question_version blocks DELETE"
  );

  // 8. Conditional immutability via parent join: question_choices under an APPROVED
  //    parent version are locked even though the choice row itself carries no status
  await expectError(
    client.query(`UPDATE "question_choices" SET "content" = 'hacked' WHERE id = $1`, [
      "qc_dhammavibhaga_001_a",
    ]),
    "parent question_version",
    "question_choice under APPROVED parent blocks UPDATE"
  );

  // 9. answer_keys under an APPROVED parent version are locked
  await expectError(
    client.query(`UPDATE "answer_keys" SET "modelAnswer" = 'hacked' WHERE id = $1`, [
      "ak_dhammavibhaga_001",
    ]),
    "parent question_version",
    "answer_key under APPROVED parent blocks UPDATE"
  );

  // 10. exam_sets: DRAFT set can be edited freely
  {
    await client.query(`UPDATE "exam_sets" SET "name" = $1 WHERE id = $2`, [
      "ชุดฝึกซ้อมธรรมวิภาค ชั้นตรี (แก้ไขระหว่าง DRAFT — มือกทดสอบ)",
      "xset_practice_dhammavibhaga_tri",
    ]);
    const { rows } = await client.query(`SELECT name FROM exam_sets WHERE id = $1`, [
      "xset_practice_dhammavibhaga_tri",
    ]);
    report(
      "DRAFT exam_set can be edited freely",
      rows[0].name.includes("แก้ไขระหว่าง DRAFT"),
      rows[0].name
    );
  }

  // 11. exam_sets: APPROVED set is locked
  await expectError(
    client.query(`UPDATE "exam_sets" SET "name" = 'hacked' WHERE id = $1`, [
      "xset_official_dhammavibhaga_tri_2568",
    ]),
    "is locked",
    "APPROVED exam_set blocks UPDATE"
  );

  // 12. exam_set_items under an APPROVED parent exam_set are locked
  await expectError(
    client.query(`UPDATE "exam_set_items" SET "score" = 999 WHERE id = $1`, ["xsi_official_001"]),
    "parent exam_set",
    "exam_set_item under APPROVED parent blocks UPDATE"
  );

  // 13. document_versions: DRAFT can edit, then lock after status change (test transition)
  {
    await client.query(`UPDATE "document_versions" SET "status" = 'APPROVED' WHERE id = $1`, [
      "dv_answer_sheet_template_v1",
    ]);
    const { rows } = await client.query(`SELECT status FROM document_versions WHERE id = $1`, [
      "dv_answer_sheet_template_v1",
    ]);
    report(
      "document_version DRAFT -> APPROVED transition succeeds (still editable while OLD.status=DRAFT)",
      rows[0].status === "APPROVED"
    );
  }
  await expectError(
    client.query(`UPDATE "document_versions" SET "fileName" = 'hacked.pdf' WHERE id = $1`, [
      "dv_answer_sheet_template_v1",
    ]),
    "is locked",
    "document_version now APPROVED blocks further UPDATE (locked immediately after transition)"
  );

  // 14. New version instead of editing: inserting versionNo=2 for the now-locked question works
  {
    await client.query(
      `INSERT INTO "question_versions" ("id","questionId","versionNo","content","status","createdAt","updatedAt")
       VALUES ('qv_dhammavibhaga_001_v2', 'q_dhammavibhaga_001', 2, 'ข้อใดเป็นองค์ประกอบของศีล 5 (ฉบับแก้ไข v2 — มือกทดสอบ)', 'DRAFT', now(), now())`
    );
    const { rows } = await client.query(
      `SELECT count(*)::int AS n FROM question_versions WHERE "questionId" = $1`,
      ["q_dhammavibhaga_001"]
    );
    report("new version row can be inserted for a question with a locked v1", rows[0].n === 2, `count=${rows[0].n}`);
  }

  // 15. Unique constraint: duplicate (questionId, versionNo) rejected
  await expectError(
    client.query(
      `INSERT INTO "question_versions" ("id","questionId","versionNo","content","status","createdAt","updatedAt")
       VALUES ('qv_dup', 'q_dhammavibhaga_001', 2, 'dup', 'DRAFT', now(), now())`
    ),
    "duplicate key",
    "duplicate (questionId, versionNo) rejected by unique constraint"
  );

  // 16. Unique constraint: duplicate (documentId, versionNo) rejected
  await expectError(
    client.query(
      `INSERT INTO "document_versions" ("id","documentId","versionNo","status","createdAt","updatedAt")
       VALUES ('dv_dup', 'doc_answer_sheet_template', 1, 'DRAFT', now(), now())`
    ),
    "duplicate key",
    "duplicate (documentId, versionNo) rejected by unique constraint"
  );

  // 17. FK enforcement: exam_set referencing a non-existent curriculum_level_subject is rejected
  await expectError(
    client.query(
      `INSERT INTO "exam_sets" ("id","curriculumLevelSubjectId","name","status","createdAt","updatedAt")
       VALUES ('xset_bad', 'does_not_exist', 'bad', 'DRAFT', now(), now())`
    ),
    "foreign key",
    "exam_set with invalid curriculumLevelSubjectId rejected by FK"
  );

  // 18. FK enforcement: exam_set_items with duplicate (examSetId, sortOrder) rejected
  await expectError(
    client.query(
      `INSERT INTO "exam_set_items" ("id","examSetId","questionVersionId","sortOrder","createdAt")
       VALUES ('xsi_dup', 'xset_official_dhammavibhaga_tri_2568', 'qv_essay_001_v1', 1, now())`
    ),
    "duplicate key",
    "duplicate (examSetId, sortOrder) rejected by unique constraint"
  );

  // 19. categories.code partial unique index allows multiple NULLs but blocks duplicate codes
  {
    await client.query(
      `INSERT INTO "categories" ("id","name","code","createdAt","updatedAt") VALUES
       ('cat_no_code_1', 'ไม่มีรหัส 1 (มือกทดสอบ)', NULL, now(), now()),
       ('cat_no_code_2', 'ไม่มีรหัส 2 (มือกทดสอบ)', NULL, now(), now())`
    );
    const { rows } = await client.query(`SELECT count(*)::int AS n FROM categories WHERE code IS NULL`);
    report("categories.code allows multiple NULLs", rows[0].n === 2, `count=${rows[0].n}`);
  }
  await expectError(
    client.query(
      `INSERT INTO "categories" ("id","name","code","createdAt","updatedAt")
       VALUES ('cat_dup_code', 'ซ้ำรหัส (มือกทดสอบ)', 'ETHICS', now(), now())`
    ),
    "duplicate key",
    "categories.code rejects duplicate non-null code"
  );

  console.log(`\n${passed} passed, ${failed} failed`);
  await client.end();
  process.exit(failed > 0 ? 1 : 0);
}

main().catch(async (err) => {
  console.error("Test harness crashed:", err);
  await client.end();
  process.exit(1);
});
