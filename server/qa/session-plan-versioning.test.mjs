import assert from "node:assert/strict";
import {createCurrentSessionPlan} from "../services/sessionPlanVersioning.js";

function fakeModel(seed, {failNewDocumentSave=false}={}) {
  const rows=seed.map(row=>({...row}));
  let nextId=1;
  const matches=(row,filter)=>{
    for(const [key,value] of Object.entries(filter||{})){
      if(key==="_id"&&value&&typeof value==="object"){
        if("$ne" in value&&String(row._id)===String(value.$ne))return false;
        if("$in" in value&&!value.$in.some(id=>String(id)===String(row._id)))return false;
      }else if(String(row[key]??"")!==String(value??""))return false;
    }
    return true;
  };
  return {
    rows,
    find(filter){
      let selected=rows.filter(row=>matches(row,filter));
      return {select(){return this;},async lean(){return selected.map(({_id})=>({_id}));}};
    },
    async create(data){
      const row={...data,_id:`new-${nextId++}`};
      let saved=false;
      row.save=async()=>{
        if(failNewDocumentSave&&!saved)throw new Error("simulated save failure");
        saved=true;
        return row;
      };
      rows.push(row);
      return row;
    },
    async updateMany(filter,update){
      const affected=rows.filter(row=>matches(row,filter));
      for(const row of affected)Object.assign(row,update.$set||{});
      return {modifiedCount:affected.length};
    },
    async deleteOne(filter){
      const index=rows.findIndex(row=>matches(row,filter));
      if(index>=0)rows.splice(index,1);
      return {deletedCount:index>=0?1:0};
    }
  };
}

const original={_id:"plan-v1",academicSession:"session-1",version:1,isCurrent:true};
const older={_id:"plan-v0",academicSession:"session-1",version:0,isCurrent:false};
const model=fakeModel([original,older]);
const next=await createCurrentSessionPlan(model,{
  academicSession:"session-1",version:2,status:"DRAFT",totalEntries:12
});
assert.equal(next.isCurrent,true);
assert.equal(model.rows.find(row=>row._id==="plan-v1").isCurrent,false);
assert.equal(model.rows.find(row=>row._id==="plan-v0").isCurrent,false);
assert.equal(model.rows.filter(row=>row.isCurrent).length,1);
assert.equal(model.rows.find(row=>row._id===next._id).version,2);

const rollbackModel=fakeModel([{_id:"existing-current",academicSession:"session-2",version:1,isCurrent:true}],{failNewDocumentSave:true});
await assert.rejects(
  createCurrentSessionPlan(rollbackModel,{academicSession:"session-2",version:2,status:"DRAFT"}),
  /simulated save failure/
);
assert.equal(rollbackModel.rows.length,1);
assert.equal(rollbackModel.rows[0].isCurrent,true);

console.log("Full-session current-version regression tests passed.");
