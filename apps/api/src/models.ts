import { Schema, model, type InferSchemaType } from "mongoose";

/*
 * Datas da AR guardadas como "YYYY-MM-DD" (ordenáveis como texto e sem fusos horários).
 * Nota: "type" é palavra reservada nos schemas Mongoose, daí { type: { type: String } }.
 */

const publicationSchema = new Schema(
  { type: { type: String }, number: String, date: String, url: String },
  { _id: false },
);

const voteSideSchema = new Schema({ group: { type: String, required: true }, count: Number, deputy: String }, { _id: false });

const voteSchema = new Schema(
  {
    _id: { type: String, required: true },
    eventId: String,
    phase: String,
    date: String,
    body: String,
    committee: String,
    meeting: String,
    result: String,
    unanimous: Boolean,
    description: String,
    inFavour: [voteSideSchema],
    against: [voteSideSchema],
    abstention: [voteSideSchema],
    absent: [voteSideSchema],
    publications: [publicationSchema],
  },
  { _id: false },
);

const eventSchema = new Schema(
  {
    _id: { type: String, required: true },
    code: String,
    phase: String,
    date: String,
    observation: String,
    committees: [new Schema({ id: String, name: String, competent: Boolean }, { _id: false })],
    publications: [publicationSchema],
    approvedTextIds: [String],
  },
  { _id: false },
);

/**
 * Explicação em linguagem simples. Só é mostrada quando status === "approved"
 * (revista por uma pessoa). Nunca é escrita pela sincronização.
 */
const explanationSchema = new Schema(
  {
    status: { type: String, enum: ["pending", "approved", "rejected"], required: true },
    // Conteúdo editorial (mesmos campos que o site Astro apresenta)
    plainTitle: String,
    shortHook: String,
    summary: String,
    kidTranslation: String,
    officialContext: String,
    theme: String,
    impactLevel: { type: String, enum: ["alto", "medio", "baixo"] },
    effectiveDate: String,
    affectedGroups: [
      new Schema(
        {
          groupId: String,
          label: String,
          sentiment: { type: String, enum: ["positive", "warning", "mixed"] },
          consequence: String,
          example: String,
        },
        { _id: false },
      ),
    ],
    beforeAfter: [new Schema({ topic: String, before: String, after: String }, { _id: false })],
    consequences: [String],
    debate: { pros: [String], cons: [String] },
    // Revisão
    generatedBy: String,
    reviewedBy: String,
    reviewedAt: Date,
    updatedAt: Date,
  },
  { _id: false },
);

const initiativeSchema = new Schema(
  {
    _id: { type: String, required: true },
    legislature: { type: String, required: true },
    session: Number,
    typeCode: { type: String, required: true },
    type: { type: String, required: true },
    number: Number,
    title: { type: String, required: true },
    /** Título em minúsculas e sem acentos, para pesquisa. */
    titleSearch: String,
    authorType: String,
    authorGroups: [String],
    authorDeputies: [new Schema({ id: String, name: String, group: String }, { _id: false })],
    textUrl: String,
    originIds: [String],
    originatedIds: [String],
    events: [eventSchema],
    votes: [voteSchema],

    // Derivados das fases e votações
    status: { type: String, required: true },
    stage: { type: String, required: true },
    voteResultPending: Boolean,
    enteredAt: String,
    lastActivityAt: String,
    lastEvent: { phase: String, date: String },
    lastVote: { phase: String, date: String, result: String, unanimous: Boolean },
    diplomaIds: [String],

    explanation: explanationSchema,
    source: { provider: String, syncedAt: Date },
  },
  { timestamps: true, versionKey: false },
);

initiativeSchema.index({ legislature: 1, lastActivityAt: -1 });
initiativeSchema.index({ status: 1, lastActivityAt: -1 });
initiativeSchema.index({ typeCode: 1, lastActivityAt: -1 });
initiativeSchema.index({ authorGroups: 1 });
initiativeSchema.index({ enteredAt: -1 });
initiativeSchema.index({ "votes.date": -1 });

const diplomaSchema = new Schema(
  {
    _id: { type: String, required: true },
    type: { type: String, required: true },
    number: String,
    secondNumber: String,
    year: Number,
    title: String,
    legislature: String,
    session: Number,
    textUrl: String,
    publications: [publicationSchema],
    initiativeIds: [String],
    dreActId: String,
  },
  { timestamps: true, versionKey: false },
);
diplomaSchema.index({ type: 1, number: 1, year: 1 });
diplomaSchema.index({ initiativeIds: 1 });

const dreActSchema = new Schema(
  {
    _id: { type: String, required: true },
    actType: { type: String, required: true },
    number: String,
    title: String,
    issuer: String,
    summary: String,
    date: String,
    drNumber: String,
    url: String,
    diplomaId: String,
  },
  { timestamps: true, versionKey: false },
);
dreActSchema.index({ date: -1 });
dreActSchema.index({ actType: 1, number: 1 });

/** Composição do Parlamento: lugares atuais por grupo parlamentar. */
const compositionSchema = new Schema(
  {
    _id: { type: String, required: true }, // legislatura
    seats: { type: Map, of: Number, default: {} },
    total: Number,
    asOf: String,
  },
  { timestamps: true, versionKey: false },
);

const syncRunSchema = new Schema(
  {
    job: { type: String, enum: ["parliament", "dre", "composition"], required: true },
    provider: String,
    ok: { type: Boolean, default: false },
    startedAt: { type: Date, required: true },
    finishedAt: Date,
    error: String,
    stats: { type: Schema.Types.Mixed, default: {} },
    dataAsOf: String,
    fallbackReason: String,
  },
  { versionKey: false },
);
syncRunSchema.index({ job: 1, startedAt: -1 });

export const Initiative = model("Initiative", initiativeSchema);
export const Diploma = model("Diploma", diplomaSchema);
export const DreAct = model("DreAct", dreActSchema);
export const SyncRun = model("SyncRun", syncRunSchema);
export const Composition = model("Composition", compositionSchema);

/** Pequenos valores de configuração calculados (ex.: legislatura detetada). */
export const Setting = model(
  "Setting",
  new Schema({ _id: { type: String, required: true }, value: Schema.Types.Mixed }, { timestamps: true, versionKey: false }),
);

export type InitiativeDoc = InferSchemaType<typeof initiativeSchema> & { _id: string };
export type DiplomaDoc = InferSchemaType<typeof diplomaSchema> & { _id: string };
export type DreActDoc = InferSchemaType<typeof dreActSchema> & { _id: string };
export type SyncRunDoc = InferSchemaType<typeof syncRunSchema>;
