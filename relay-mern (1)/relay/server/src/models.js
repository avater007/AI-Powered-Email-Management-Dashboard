import mongoose from "mongoose";
const { Schema } = mongoose;
const Msg = new Schema({ f: String, w: String, me: Boolean, b: String }, { _id: false });
export const User = mongoose.model("User", new Schema({ email: { type: String, unique: true }, hash: String, accounts: [String] }));
export const Email = mongoose.model("Email", new Schema({
  user: { type: Schema.Types.ObjectId, index: true },
  from: String, org: String, addr: String, subj: String, when: String,
  unread: Boolean, imp: Boolean, meet: Boolean, arch: Boolean, done: Boolean, wait: Boolean,
  summ: String, dates: [String], next: String, t: [Msg],
  cls: String,            // assistant | client | none | review
  conf: Number, why: String,
  manual: Boolean,        // true when the assistant overrides the AI
  note: String            // e.g. "Priya asked you to take over"
}));
