import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { isRelevantTrackedJob } from "../lib/operator/job-relevance.ts";
import {
  adzunaCountryFromLocations,
  listingFingerprint,
  listingMatchesQuery,
  mapAshbyJob,
  mapIndianApiJob,
  mapRemotiveJob,
  mergeNormalizedJobs,
  SEARCH_IMPORT_CAP,
  searchQueriesFromTargets,
  stripHtml,
  indiaJobLocation,
} from "../lib/operator/job-search.ts";

test("target roles become search queries without a hardcoded PM pack", () => {
  const pm = searchQueriesFromTargets({ targetRoles: ["PM", "Senior Product Manager"] });
  assert.equal(pm.length, 1);
  assert.equal(pm[0]?.query, "product manager");
  assert.equal(pm[0]?.remotiveCategory, "product");
  assert.equal(pm[0]?.museCategory, "Product");

  const mixed = searchQueriesFromTargets({
    targetRoles: ["Staff Software Engineer", "Product Designer", "Data Scientist"],
  });
  assert.deepEqual(mixed.map(item => item.query), [
    "Staff Software Engineer",
    "Product Designer",
    "Data Scientist",
  ]);
  assert.equal(mixed[0]?.remotiveCategory, "software-dev");
  assert.equal(mixed[1]?.jobicyIndustry, "design");
  assert.equal(mixed[2]?.museCategory, "Data Science");

  assert.deepEqual(searchQueriesFromTargets({ targetRoles: [] }), []);
});

test("Remotive mapper keeps title, company, url, and a provider id", () => {
  const job = mapRemotiveJob({
    id: 42,
    url: "https://remotive.com/remote-jobs/product/example-42",
    title: "Senior Product Manager",
    company_name: "Acme",
    candidate_required_location: "Worldwide",
    description: "<p>Lead the <b>roadmap</b>.</p>",
  });
  assert.ok(job);
  assert.equal(job.title, "Senior Product Manager");
  assert.equal(job.company, "Acme");
  assert.equal(job.location, "Worldwide");
  assert.equal(job.url, "https://remotive.com/remote-jobs/product/example-42");
  assert.equal(job.source, "Remotive · Acme");
  assert.equal(job.providerId, "remotive:42");
  assert.equal(job.description, "Lead the roadmap.");
  assert.equal(listingFingerprint(job), job.url.replace(/\/+$/, "").toLocaleLowerCase());
});

test("India jobs mapper uses apply_link and Bangalore for Bengaluru", () => {
  const job = mapIndianApiJob({
    id: 1,
    title: "Software Engineer - Fresher",
    company: "TechCorp",
    job_description: "We are looking for <b>engineers</b>.",
    role_and_responsibility: "Build APIs.",
    location: "Bangalore",
    apply_link: "https://techcorp.com/careers/software-engineer-fresher",
  });
  assert.ok(job);
  assert.equal(job.title, "Software Engineer - Fresher");
  assert.equal(job.company, "TechCorp");
  assert.equal(job.location, "Bangalore");
  assert.equal(job.url, "https://techcorp.com/careers/software-engineer-fresher");
  assert.equal(job.source, "India jobs · TechCorp");
  assert.equal(job.providerId, "indianapi:1");
  assert.match(job.description, /engineers/);
  assert.match(job.description, /Build APIs/);
  assert.equal(indiaJobLocation(["Chennai", "Bengaluru", "Remote India"]), "Chennai");
  assert.equal(indiaJobLocation(["Bengaluru"]), "Bangalore");
  assert.equal(indiaJobLocation(["Remote India"]), "India");
  assert.equal(indiaJobLocation(["Seattle"]), "");
});

test("Ashby mapper uses the public jobUrl and remote flag", () => {
  const job = mapAshbyJob({
    title: "Product Designer",
    location: "San Francisco",
    isRemote: true,
    jobUrl: "https://jobs.ashbyhq.com/notion/abc",
    descriptionPlain: "Shape the product.",
  }, "notion");
  assert.ok(job);
  assert.equal(job.company, "notion");
  assert.equal(job.location, "Remote");
  assert.equal(job.url, "https://jobs.ashbyhq.com/notion/abc");
  assert.equal(job.source, "Ashby · notion");
});

test("listing match keeps product/manager tokens and caps merged results", () => {
  assert.equal(listingMatchesQuery({ title: "Senior Product Manager, Platform" }, "product manager"), true);
  assert.equal(listingMatchesQuery({ title: "Staff Software Engineer" }, "product manager"), false);
  assert.equal(listingMatchesQuery({ title: "UX Engineer", description: "product designer for mobile" }, "product designer"), true);
  const merged = mergeNormalizedJobs([
    Array.from({ length: 40 }, (_, index) => ({
      title: `Role ${index}`,
      company: "Co",
      location: "Remote",
      url: `https://example.com/jobs/${index}`,
      description: "",
      source: "Remotive · Co",
    })),
    [{ title: "Extra", company: "Co", location: "Remote", url: "https://example.com/jobs/0", description: "", source: "Jobicy · Co" }],
  ]);
  assert.equal(merged.length, SEARCH_IMPORT_CAP);
  assert.equal(stripHtml("<p>Hello &amp; <b>welcome</b></p>"), "Hello & welcome");
  assert.equal(adzunaCountryFromLocations(["Bengaluru", "Remote India"]), "in");
});

test("unscored collected roles stay on the board until a résumé exists", () => {
  assert.equal(isRelevantTrackedJob({
    title: "Product Designer",
    fitScore: 0,
    status: "recommended",
    source: "Remotive · Acme",
  }, { targetRoles: ["Product Designer"] }), true);
});

test("Collect roles puts target search first and never fetches LinkedIn", async () => {
  const [page, jobs, search] = await Promise.all([
    readFile(new URL("../app/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../db/jobs.ts", import.meta.url), "utf8"),
    readFile(new URL("../lib/operator/job-search.ts", import.meta.url), "utf8"),
  ]);
  const intake = page.slice(page.indexOf("function JobIntake"), page.indexOf("function LinkedInHandoff"));
  assert.match(intake, /Get roles for my targets/);
  assert.match(intake, /We pull public job boards\. We do not open LinkedIn\./);
  assert.ok(intake.indexOf("Get roles for my targets") < intake.indexOf("By company board"));
  assert.ok(intake.indexOf("By company board") < intake.indexOf("Paste a posting URL"));
  assert.match(intake, /importFrom: \{ provider: "targets" \}/);
  assert.match(intake, /COMPANY_BOARD_PROVIDERS/);
  assert.match(search, /Ashby/);
  assert.match(jobs, /importJobsForTargets/);
  assert.match(jobs, /remotive\.com\/api\/remote-jobs/);
  assert.match(jobs, /api\.ashbyhq\.com\/posting-api\/job-board/);
  assert.match(jobs, /jobs\.indianapi\.in\/jobs/);
  assert.match(jobs, /INDIANAPI_JOBS_KEY/);
  assert.doesNotMatch(jobs, /linkedin\.com/);
  assert.doesNotMatch(search, /fetch\s*\(/);
  assert.doesNotMatch(search, /linkedin/i);
});
