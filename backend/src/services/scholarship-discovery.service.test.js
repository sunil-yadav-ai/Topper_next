import test from "node:test";
import assert from "node:assert/strict";
import {
  parseUgcFrgOpportunities,
  parseUgcScholarshipDetails,
  parseUgcStudentListings,
  parseTribalScholarshipHeadings,
  parseUpScholarshipTimetable,
} from "./scholarship-discovery.service.js";
import { extractUgcEligibilityRules } from "./scholarship.service.js";

test("UGC student-corner collector only parses official scholarship and fellowship rows", () => {
  const listings = parseUgcStudentListings(`
    <table>
      <tr><td>1</td><td> IshanUday Scholarship </td><td><a href="/Scholarships/stu_Scholarship5">View</a></td></tr>
      <tr><td>2</td><td> Junior Research Fellowship </td><td><a href="/Fellowship/stu_Fellowship1">View</a></td></tr>
      <tr><td>3</td><td>Other service</td><td><a href="/studentcorner/other">View</a></td></tr>
    </table>
  `);

  assert.deepEqual(listings.map(({ title, kind }) => ({ title, kind })), [
    { title: "IshanUday Scholarship", kind: "scholarship" },
    { title: "Junior Research Fellowship", kind: "fellowship" },
  ]);
  assert.equal(listings[0].url, "https://www.ugc.gov.in/Scholarships/stu_Scholarship5");
});

test("UGC detail extraction keeps only published objective, eligibility, and assistance fields", () => {
  const details = parseUgcScholarshipDetails(`
    <div class="row text-container left-margin">
      <div class="col-md-3 info"><p><span>Name of the Scheme:</span></p></div>
      <div class="col-md-9 info"><p>Sample Fellowship</p></div>
      <div class="col-md-3 info"><p><span>Objective of Scheme:</span></p></div>
      <div class="col-md-9 info"><p>Support research students.</p></div>
      <div class="col-md-3 info"><p><span>Eligibility:</span></p></div>
      <div class="col-md-9 info"><p>Must be enrolled in a Ph.D. programme.</p></div>
      <div class="col-md-3 info"><p><span>Financial Assistance:</span></p></div>
      <div class="col-md-9 info"><p>Rs. 37,000/- per month</p></div>
    </div>
  `);

  assert.equal(details.title, "Sample Fellowship");
  assert.equal(details.description, "Support research students.");
  assert.equal(details.eligibility, "Must be enrolled in a Ph.D. programme.");
  assert.equal(details.assistance, "Rs. 37,000/- per month");
});

test("UGC JRF requirements become questions only when explicitly stated by the official page", () => {
  const rules = extractUgcEligibilityRules(
    "Candidates who have qualified in NET-JRF or the UGC-CSIR joint test. " +
    "However, the registration for the M.Phil/PhD is made by the Universities/Institutions/Colleges " +
    "within stipulated period of two years from the date of declaration of result.",
  );

  assert.deepEqual(rules.map(({ field, operator, value }) => ({ field, operator, value })), [
    { field: "netJrfQualified", operator: "eq", value: true },
    { field: "researchRegistrationWithinStipulatedPeriod", operator: "eq", value: true },
  ]);
  assert.equal(extractUgcEligibilityRules("Students may apply for this fellowship.").length, 0);
});

test("UGC FRG dates determine status and hidden opportunities are not collected", () => {
  const opportunities = parseUgcFrgOpportunities(`
    <div class="col-md-4 col-xs-12 plr10">
      <div class="schemebox">
        <h5>Closed Fellowship</h5>
        <strong>Start date</strong><h6>05-09-2022</h6>
        <strong>End date</strong><h6>10-10-2022</h6>
        <a href="/download/guidelines.pdf">Guidelines</a>
      </div>
    </div>
    <div class="col-md-4 col-xs-12 plr10" style="display:none;">
      <div class="schemebox">
        <h5>Hidden Draft</h5>
        <strong>Start date</strong><h6>01-01-2027</h6>
        <strong>End date</strong><h6>31-01-2027</h6>
      </div>
    </div>
  `, new Date("2026-11-23T12:00:00Z"));

  assert.equal(opportunities.length, 1);
  assert.equal(opportunities[0].title, "Closed Fellowship");
  assert.equal(opportunities[0].applicationStatus, "closed");
  assert.equal(opportunities[0].applicationDeadline.toISOString(), "2022-10-10T23:59:59.999Z");
  assert.equal(opportunities[0].officialGuidelineUrl, "/download/guidelines.pdf");
});

test("Tribal Affairs scheme pages do not turn undated programmes into open applications", () => {
  const schemes = parseTribalScholarshipHeadings(`
    <h3>Pre Matric Scholarship Scheme</h3>
    <p>Applicable to students studying in Classes IX-X.</p>
    <h4>Resources</h4>
    <p>Guidelines and reports.</p>
  `);

  assert.equal(schemes.length, 1);
  assert.equal(schemes[0].title, "Pre Matric Scholarship Scheme");
  assert.equal(schemes[0].applicationStatus, "unknown");
  assert.equal(schemes[0].applicationDeadline, null);
});

test("Uttar Pradesh timetable issue dates are not interpreted as application deadlines", () => {
  const schemes = parseUpScholarshipTimetable(`
    <table>
      <tr><th>Sl No.</th><th>Scheme</th><th>Category</th><th>Issue Date</th><th>Notice</th></tr>
      <tr><td>1</td><td><strong>Postmatric (2026-27)</strong></td><td>SC, ST, OBC</td><td>20-07-2026</td><td><a href="/notice.pdf">Download</a></td></tr>
    </table>
  `);

  assert.equal(schemes.length, 1);
  assert.equal(schemes[0].title, "Postmatric (2026-27)");
  assert.equal(schemes[0].academicYear, "2026-27");
  assert.equal(schemes[0].issueDate, "20-07-2026");
  assert.equal(schemes[0].applicationDeadline, undefined);
});
