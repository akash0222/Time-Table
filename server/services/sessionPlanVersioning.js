/**
 * Save a full-session plan as the only current version for its academic
 * session. If the current-version switch fails, remove the new draft and
 * restore the previously-current flags before rethrowing the error.
 */
export async function createCurrentSessionPlan(Model, {academicSession, ...data}) {
  const previousCurrent = await Model.find({academicSession, isCurrent: true})
    .select("_id")
    .lean();
  const previousIds = previousCurrent.map(item => item._id);

  const doc = await Model.create({
    ...data,
    academicSession,
    isCurrent: false
  });

  try {
    await Model.updateMany(
      {academicSession, isCurrent: true, _id: {$ne: doc._id}},
      {$set: {isCurrent: false}}
    );
    doc.isCurrent = true;
    await doc.save();
    return doc;
  } catch (error) {
    // Compensate independently so a cleanup failure does not prevent trying
    // to restore the previous current version.
    const cleanup = [Model.deleteOne({_id: doc._id})];
    if (previousIds.length) {
      cleanup.push(Model.updateMany(
        {academicSession, _id: {$in: previousIds}},
        {$set: {isCurrent: true}}
      ));
    }
    await Promise.allSettled(cleanup);
    throw error;
  }
}
