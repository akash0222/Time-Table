import {Router} from "express";
import mongoose from "mongoose";
import Semester from "../models/Semester.js";
import AcademicSession from "../models/AcademicSession.js";
import Program from "../models/Program.js";
import Section from "../models/Section.js";
import {allowRoles} from "../middleware/auth.js";

const router = Router();
const canManage = allowRoles("ADMIN", "SCHEDULER");

router.get("/", async (req, res) => {
  try {
    const filter = {};
    if (req.query.academicSession) filter.academicSession = req.query.academicSession;
    if (req.query.program) filter.program = req.query.program;
    if (req.query.activeOnly === "true") filter.active = true;
    const rows = await Semester.find(filter)
      .populate("academicSession", "name active")
      .populate("program", "name code active")
      .sort({ order: 1, name: 1 }).lean();
    res.json(rows);
  } catch (e) { res.status(500).json({message:e.message}); }
});

router.post("/", canManage, async (req, res) => {
  try {
    const {academicSession, program, name} = req.body || {};
    if (![academicSession, program].every(mongoose.isValidObjectId) || !String(name || "").trim()) {
      return res.status(400).json({message:"Academic Session, Program and Semester Name are required."});
    }
    const session = await AcademicSession.findById(academicSession).lean();
    const prog = await Program.findById(program).lean();
    if (!session || !prog) return res.status(400).json({message:"Select an existing Academic Session and Program."});
    const linked = (session.programDates || []).some(row => String(row.program) === String(program));
    if (!linked) return res.status(400).json({message:"Link this Program to the Academic Session first in Academic Sessions, then create its semesters."});
    const row = await Semester.create({academicSession, program, name:String(name).trim(), order:Math.max(1,Number(req.body.order)||1), active:req.body.active!==false});
    res.status(201).json(await Semester.findById(row._id).populate("academicSession","name active").populate("program","name code active").lean());
  } catch (e) {
    res.status(e.code===11000?409:400).json({message:e.code===11000?"This semester already exists for the selected program and academic session.":e.message});
  }
});

router.put("/:id", canManage, async (req, res) => {
  try {
    const current = await Semester.findById(req.params.id);
    if (!current) return res.status(404).json({message:"Semester not found."});
    const academicSession = req.body.academicSession || current.academicSession;
    const program = req.body.program || current.program;
    const name = String(req.body.name ?? current.name).trim();
    if (![academicSession, program].every(mongoose.isValidObjectId) || !name) return res.status(400).json({message:"Academic Session, Program and Semester Name are required."});
    const session = await AcademicSession.findById(academicSession).lean();
    if (!session || !(session.programDates||[]).some(row=>String(row.program)===String(program))) return res.status(400).json({message:"The selected Program must be linked to the selected Academic Session first."});
    const moved = String(current.academicSession)!==String(academicSession) || String(current.program)!==String(program) || current.name!==name;
    if (moved) {
      const used = await Section.exists({semester:current.name, programId:current.program, academicSession:current.academicSession});
      if (used) return res.status(409).json({message:"This semester is already used by sections. Keep its identity unchanged; create a new semester for new mappings."});
    }
    current.academicSession=academicSession; current.program=program; current.name=name;
    current.order=Math.max(1,Number(req.body.order ?? current.order)||1);
    current.active=req.body.active===undefined?current.active:Boolean(req.body.active);
    await current.save();
    res.json(await Semester.findById(current._id).populate("academicSession","name active").populate("program","name code active").lean());
  } catch(e) { res.status(e.code===11000?409:400).json({message:e.code===11000?"This semester already exists for the selected program and academic session.":e.message}); }
});

router.delete("/:id", canManage, async (req, res) => {
  try {
    const row=await Semester.findById(req.params.id);
    if(!row) return res.status(404).json({message:"Semester not found."});
    const used=await Section.exists({semester:row.name,programId:row.program,academicSession:row.academicSession});
    if(used) return res.status(409).json({message:"This semester is assigned to one or more sections. Deactivate it instead of deleting it."});
    await row.deleteOne();
    res.json({ok:true});
  } catch(e) { res.status(400).json({message:e.message}); }
});

export default router;
