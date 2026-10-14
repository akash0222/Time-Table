import assert from "node:assert/strict";
import {subjectProgramMatchesSection} from "../services/subjectProgramMapping.js";

const bba={_id:"program-bba",name:"Bachelor of Business Administration",code:"BBA"};
const mba={_id:"program-mba",name:"Master of Business Administration",code:"MBA"};

assert.equal(subjectProgramMatchesSection({programId:bba._id,program:"BBA"},bba),true);
assert.equal(subjectProgramMatchesSection({programId:bba._id,program:"BBA"},mba),false);
assert.equal(subjectProgramMatchesSection({program:"bba"},bba),true);
assert.equal(subjectProgramMatchesSection({program:"MBA"},mba),true);
assert.equal(subjectProgramMatchesSection({program:"MBA"},bba),false);
assert.equal(subjectProgramMatchesSection({program:"Master of Business Administration"},mba),true);
assert.equal(subjectProgramMatchesSection({program:""},bba),true);
assert.equal(subjectProgramMatchesSection(null,bba),true);
assert.equal(subjectProgramMatchesSection({program:"BBA"},null),true);

console.log("Subject program mapping regression tests passed.");
