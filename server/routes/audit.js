import express from "express";
import AuditLog from "../models/AuditLog.js";
import { allowRoles } from "../middleware/auth.js";

const router=express.Router();
router.get("/",allowRoles("ADMIN","SCHEDULER"),async(req,res)=>{
  try{
    const page=Math.max(1,Number(req.query.page||1)); const limit=Math.min(100,Math.max(10,Number(req.query.limit||50)));
    const filter={};
    if(req.query.action) filter.action=req.query.action;
    if(req.query.category) filter.category=req.query.category;
    if(req.query.from||req.query.to){filter.createdAt={}; if(req.query.from)filter.createdAt.$gte=new Date(req.query.from); if(req.query.to)filter.createdAt.$lte=new Date(req.query.to);}
    const [rows,total,actions,categories]=await Promise.all([
      AuditLog.find(filter).populate("user","name username role").sort({createdAt:-1}).skip((page-1)*limit).limit(limit).lean(),
      AuditLog.countDocuments(filter),
      AuditLog.distinct("action"),
      AuditLog.distinct("category")
    ]);
    res.json({rows,total,page,limit,pages:Math.ceil(total/limit),actions:actions.sort(),categories:categories.sort()});
  }catch(e){res.status(500).json({message:e.message});}
});
router.delete("/clear",allowRoles("ADMIN"),async(req,res)=>{
  try{const result=await AuditLog.deleteMany({});res.json({ok:true,deleted:result.deletedCount});}
  catch(e){res.status(500).json({message:e.message});}
});
export default router;
