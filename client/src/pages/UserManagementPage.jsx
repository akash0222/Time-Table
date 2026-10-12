import React, {useEffect, useState} from "react";
import axios from "axios";
import {API} from "../core/api";
import {refId} from "../core/utils.js";

export default function UserManagement({data,setMessage}){
  const blankForm=()=>({name:"",username:"",password:"",role:"VIEWER",faculty:"",section:""});
  const [users,setUsers]=useState([]);
  const [form,setForm]=useState(blankForm);
  const [editingId,setEditingId]=useState("");
  const [saving,setSaving]=useState(false);

  async function loadUsers(){
    try{
      const r=await axios.get(`${API}/auth/users`);
      setUsers(r.data||[]);
    }catch(e){
      setMessage(e.response?.data?.message||e.message);
    }
  }

  useEffect(()=>{loadUsers()},[]);

  function resetForm(){
    setEditingId("");
    setForm(blankForm());
  }

  function editUser(u){
    setEditingId(String(u._id));
    setForm({
      name:u.name||"",
      username:u.username||"",
      password:"",
      role:u.role||"VIEWER",
      faculty:refId(u.faculty),
      section:refId(u.section)
    });
    setMessage(`Editing mappings for ${u.username}. Save changes when finished.`);
    window.scrollTo({top:0,behavior:"smooth"});
  }

  function validateMapping(){
    if(!String(form.name||"").trim()){
      setMessage("Full name is required.");
      return false;
    }
    if(form.role==="VIEWER"&&!form.section){
      setMessage("Select a section for a Viewer account.");
      return false;
    }
    if(form.role==="FACULTY"&&!form.faculty){
      setMessage("Select a faculty mapping for a Faculty account.");
      return false;
    }
    if(form.password&&String(form.password).length<10){
      setMessage("Password must contain at least 10 characters.");
      return false;
    }
    return true;
  }

  async function submitUser(){
    if(!validateMapping()) return;
    setSaving(true);
    try{
      if(editingId){
        const body={
          name:String(form.name).trim(),
          role:form.role,
          faculty:form.faculty||null,
          section:form.section||null
        };
        if(form.password) body.password=form.password;
        await axios.put(`${API}/auth/users/${editingId}`,body);
        setMessage("User details and mappings updated.");
      }else{
        await axios.post(`${API}/auth/users`,form);
        setMessage("User created.");
      }
      resetForm();
      await loadUsers();
    }catch(e){
      setMessage(e.response?.data?.message||e.message);
    }finally{
      setSaving(false);
    }
  }

  async function toggle(u){
    try{
      await axios.put(`${API}/auth/users/${u._id}`,{active:!u.active});
      setMessage(u.active?"User deactivated.":"User activated.");
      await loadUsers();
    }catch(e){
      setMessage(e.response?.data?.message||e.message);
    }
  }

  const selectedRole=form.role;
  return <section className="panel">
    <div className="panel-head">
      <div>
        <h2>User Management</h2>
        <p>Create users, assign roles, and maintain faculty/section mappings.</p>
      </div>
    </div>

    <div className="form-grid">
      <label className="field">
        <span>Full name</span>
        <input placeholder="Full name" value={form.name} onChange={e=>setForm({...form,name:e.target.value})}/>
      </label>
      <label className="field">
        <span>Username</span>
        <input placeholder="Username" value={form.username} disabled={Boolean(editingId)} onChange={e=>setForm({...form,username:e.target.value})}/>
      </label>
      <label className="field">
        <span>{editingId?"New password (optional)":"Temporary password"}</span>
        <input placeholder={editingId?"Leave blank to keep current password":"Temporary password"} type="password" value={form.password} onChange={e=>setForm({...form,password:e.target.value})}/>
      </label>
      <label className="field">
        <span>Role</span>
        <select value={form.role} onChange={e=>setForm({...form,role:e.target.value})}>
          <option>VIEWER</option><option>FACULTY</option><option>SCHEDULER</option><option>ADMIN</option>
        </select>
      </label>
      <label className="field">
        <span>Faculty mapping</span>
        <select value={form.faculty} onChange={e=>setForm({...form,faculty:e.target.value})}>
          <option value="">No faculty mapping</option>
          {(data.faculty||[]).map(f=><option key={f._id} value={f._id}>{f.name}</option>)}
        </select>
      </label>
      <label className="field">
        <span>Section mapping</span>
        <select value={form.section} onChange={e=>setForm({...form,section:e.target.value})}>
          <option value="">No section mapping</option>
          {(data.sections||[]).map(x=><option key={x._id} value={x._id}>{x.program} · {x.semester} · {x.name}</option>)}
        </select>
      </label>
      <div className="form-actions" style={{alignSelf:"end"}}>
        <button className="primary" type="button" disabled={saving} onClick={submitUser}>
          {saving?"Saving…":editingId?"Save User Changes":"Create User"}
        </button>
        {editingId&&<button className="secondary" type="button" disabled={saving} onClick={resetForm}>Cancel</button>}
      </div>
    </div>

    <div className="table-wrap">
      <table>
        <thead><tr><th>Name</th><th>Username</th><th>Role</th><th>Faculty</th><th>Section</th><th>Status</th><th>Actions</th></tr></thead>
        <tbody>
          {users.map(u=><tr key={u._id}>
            <td>{u.name}</td>
            <td>{u.username}</td>
            <td>{u.role}</td>
            <td>{u.faculty?.name||"—"}</td>
            <td>{u.section?[u.section.program,u.section.semester,u.section.name].filter(Boolean).join(" · ")||u.section.name||"Mapped": "—"}</td>
            <td>{u.active?"Active":"Inactive"}</td>
            <td>
              <div className="form-actions" style={{gap:6,flexWrap:"wrap"}}>
                <button className="secondary" type="button" onClick={()=>editUser(u)}>Edit</button>
                <button className="secondary" type="button" onClick={()=>toggle(u)}>{u.active?"Deactivate":"Activate"}</button>
              </div>
            </td>
          </tr>)}
          {!users.length&&<tr><td colSpan={7}>No users found.</td></tr>}
        </tbody>
      </table>
    </div>
  </section>;
}
