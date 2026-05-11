// scripts/upload-laws.js
// ─────────────────────────────────────────
// Run ONCE from inside the scripts/ folder:
//   node upload-laws.js
//
// Requires env vars (set in your terminal before running):
//   $env:PINECONE_API_KEY = "your-key"
//   $env:NOMIC_API_KEY    = "your-key"
// ─────────────────────────────────────────

const { Pinecone } = require('@pinecone-database/pinecone');
const fetch        = require('node-fetch');

const PINECONE_API_KEY = process.env.PINECONE_API_KEY;
const NOMIC_API_KEY    = process.env.NOMIC_API_KEY;
const INDEX_HOST       = 'https://lexarena-laws-g6ytlqa.svc.aped-4627-b74a.pinecone.io';
const INDEX_NAME       = 'lexarena-laws';
const BATCH_SIZE       = 50;

if (!PINECONE_API_KEY || !NOMIC_API_KEY) {
  console.error('ERROR: Set PINECONE_API_KEY and NOMIC_API_KEY env vars first.');
  console.error('Run: $env:PINECONE_API_KEY="your-key"');
  console.error('Run: $env:NOMIC_API_KEY="your-key"');
  process.exit(1);
}

// ── LAW SECTIONS DATA ─────────────────────
// Curated from IPC 1860, CrPC 1973, Indian Evidence Act 1872
// These are the most-cited sections in Indian criminal and civil practice.
// Text sourced from indiacode.nic.in (official government source).

const LAW_SECTIONS = [

  // ═══════════════════════════════════════
  // INDIAN PENAL CODE 1860
  // ═══════════════════════════════════════
  { id: 'IPC-299', act: 'IPC', section: '299', title: 'Culpable homicide',
    text: 'Section 299 IPC — Culpable homicide: Whoever causes death by doing an act with the intention of causing death, or with the intention of causing such bodily injury as is likely to cause death, or with the knowledge that he is likely by such act to cause death, commits the offence of culpable homicide. Explanation 1: A person who causes bodily injury to another who is labouring under a disorder, disease or bodily infirmity, and thereby accelerates the death of that other, shall be deemed to have caused his death. Explanation 2: Where death is caused by bodily injury, the person who causes such bodily injury shall be deemed to have caused the death, although by resorting to proper remedies and skilful treatment the death might have been prevented.' },

  { id: 'IPC-300', act: 'IPC', section: '300', title: 'Murder',
    text: 'Section 300 IPC — Murder: Except in the cases hereinafter excepted, culpable homicide is murder, if the act by which the death is caused is done with the intention of causing death, or if it is done with the intention of causing such bodily injury as the offender knows to be likely to cause the death of the person to whom the harm is caused, or if it is done with the intention of causing bodily injury to any person and the bodily injury intended to be inflicted is sufficient in the ordinary course of nature to cause death, or if the person committing the act knows that it is so imminently dangerous that it must, in all probability, cause death or such bodily injury as is likely to cause death, and commits such act without any excuse for incurring the risk of causing death or such injury as aforesaid. Exceptions: 1. Culpable homicide is not murder if the offender, whilst deprived of the power of self-control by grave and sudden provocation, causes the death of the person who gave the provocation. 2. Culpable homicide is not murder if the offender, in the exercise in good faith of the right of private defence of person or property, exceeds the power given to him by law and causes the death of the person against whom he is exercising such right of defence without premeditation, and without any intention of doing more harm than is necessary for the purpose of such defence.' },

  { id: 'IPC-302', act: 'IPC', section: '302', title: 'Punishment for murder',
    text: 'Section 302 IPC — Punishment for murder: Whoever commits murder shall be punished with death, or imprisonment for life, and shall also be liable to fine.' },

  { id: 'IPC-304', act: 'IPC', section: '304', title: 'Punishment for culpable homicide not amounting to murder',
    text: 'Section 304 IPC — Punishment for culpable homicide not amounting to murder: Whoever commits culpable homicide not amounting to murder shall be punished with imprisonment for life, or imprisonment of either description for a term which may extend to ten years, and shall also be liable to fine, if the act by which the death is caused is done with the intention of causing death, or of causing such bodily injury as is likely to cause death; or with imprisonment of either description for a term which may extend to ten years, or with fine, or with both, if the act is done with the knowledge that it is likely to cause death, but without any intention to cause death, or to cause such bodily injury as is likely to cause death.' },

  { id: 'IPC-304A', act: 'IPC', section: '304A', title: 'Causing death by negligence',
    text: 'Section 304A IPC — Causing death by negligence: Whoever causes the death of any person by doing any rash or negligent act not amounting to culpable homicide, shall be punished with imprisonment of either description for a term which may extend to two years, or with fine, or with both.' },

  { id: 'IPC-304B', act: 'IPC', section: '304B', title: 'Dowry death',
    text: 'Section 304B IPC — Dowry death: Where the death of a woman is caused by any burns or bodily injury or occurs under suspicious circumstances within seven years of marriage, and it is shown that soon before her death she was subjected to cruelty or harassment by her husband or any relative of her husband for, or in connection with, any demand for dowry, such death shall be called "dowry death", and such husband or relative shall be deemed to have caused her death. Punishment: Whoever commits dowry death shall be punished with imprisonment for a term which shall not be less than seven years but which may extend to imprisonment for life.' },

  { id: 'IPC-306', act: 'IPC', section: '306', title: 'Abetment of suicide',
    text: 'Section 306 IPC — Abetment of suicide: If any person commits suicide, whoever abets the commission of such suicide, shall be punished with imprisonment of either description for a term which may extend to ten years, and shall also be liable to fine.' },

  { id: 'IPC-307', act: 'IPC', section: '307', title: 'Attempt to murder',
    text: 'Section 307 IPC — Attempt to murder: Whoever does any act with such intention or knowledge, and under such circumstances that, if he by that act caused death, he would be guilty of murder, shall be punished with imprisonment of either description for a term which may extend to ten years, and shall also be liable to fine; and if hurt is caused to any person by such act, the offender shall be liable either to imprisonment for life, or to such punishment as is hereinbefore mentioned. When any person offending under this section is under sentence of imprisonment for life, he may, if hurt is caused, be punished with death.' },

  { id: 'IPC-308', act: 'IPC', section: '308', title: 'Attempt to commit culpable homicide',
    text: 'Section 308 IPC — Attempt to commit culpable homicide: Whoever does any act with such intention or knowledge and under such circumstances that, if he by that act caused death, he would be guilty of culpable homicide not amounting to murder, shall be punished with imprisonment of either description for a term which may extend to three years, or with fine, or with both; and, if hurt is caused to any person by such act, shall be punished with imprisonment of either description for a term which may extend to seven years, or with fine, or with both.' },

  { id: 'IPC-319', act: 'IPC', section: '319', title: 'Hurt',
    text: 'Section 319 IPC — Hurt: Whoever causes bodily pain, disease or infirmity to any person is said to cause hurt.' },

  { id: 'IPC-320', act: 'IPC', section: '320', title: 'Grievous hurt',
    text: 'Section 320 IPC — Grievous hurt: The following kinds of hurt only are designated as grievous: First — Emasculation. Secondly — Permanent privation of the sight of either eye. Thirdly — Permanent privation of the hearing of either ear. Fourthly — Privation of any member or joint. Fifthly — Destruction or permanent impairing of the powers of any member or joint. Sixthly — Permanent disfiguration of the head or face. Seventhly — Fracture or dislocation of a bone or tooth. Eighthly — Any hurt which endangers life or which causes the sufferer to be during the space of twenty days in severe bodily pain, or unable to follow his ordinary pursuits.' },

  { id: 'IPC-323', act: 'IPC', section: '323', title: 'Punishment for voluntarily causing hurt',
    text: 'Section 323 IPC — Punishment for voluntarily causing hurt: Whoever, except in the case provided for by section 334, voluntarily causes hurt, shall be punished with imprisonment of either description for a term which may extend to one year, or with fine which may extend to one thousand rupees, or with both.' },

  { id: 'IPC-325', act: 'IPC', section: '325', title: 'Punishment for voluntarily causing grievous hurt',
    text: 'Section 325 IPC — Punishment for voluntarily causing grievous hurt: Whoever, except in the case provided for by section 335, voluntarily causes grievous hurt, shall be punished with imprisonment of either description for a term which may extend to seven years, and shall also be liable to fine.' },

  { id: 'IPC-354', act: 'IPC', section: '354', title: 'Assault or criminal force to woman with intent to outrage her modesty',
    text: 'Section 354 IPC — Assault or criminal force to woman with intent to outrage her modesty: Whoever assaults or uses criminal force to any woman, intending to outrage or knowing it to be likely that he will thereby outrage her modesty, shall be punished with imprisonment of either description for a term which shall not be less than one year but which may extend to five years, and shall also be liable to fine.' },

  { id: 'IPC-375', act: 'IPC', section: '375', title: 'Rape',
    text: 'Section 375 IPC — Rape: A man is said to commit rape who, except in the case hereinafter excepted, has sexual intercourse with a woman under circumstances falling under any of the following descriptions: First — Against her will. Secondly — Without her consent. Thirdly — With her consent, when her consent has been obtained by putting her or any person in whom she is interested in fear of death or of hurt. Fourthly — With her consent, when the man knows that he is not her husband, and that her consent is given because she believes that he is another man to whom she is or believes herself to be lawfully married. Fifthly — With her consent, when, at the time of giving such consent, by reason of unsoundness of mind or intoxication or the administration by him personally or through another of any stupefying or unwholesome substance, she is unable to understand the nature and consequences of that to which she gives consent.' },

  { id: 'IPC-376', act: 'IPC', section: '376', title: 'Punishment for rape',
    text: 'Section 376 IPC — Punishment for rape: Whoever commits rape shall be punished with rigorous imprisonment of either description for a term which shall not be less than seven years, but which may extend to imprisonment for life, and shall also be liable to fine. Whoever commits rape on a woman under sixteen years of age shall be punished with rigorous imprisonment for a term which shall not be less than ten years, but which may extend to imprisonment for life, and shall also be liable to fine.' },

  { id: 'IPC-378', act: 'IPC', section: '378', title: 'Theft',
    text: 'Section 378 IPC — Theft: Whoever, intending to take dishonestly any moveable property out of the possession of any person without that person\'s consent, moves that property in order to such taking, is said to commit theft.' },

  { id: 'IPC-379', act: 'IPC', section: '379', title: 'Punishment for theft',
    text: 'Section 379 IPC — Punishment for theft: Whoever commits theft shall be punished with imprisonment of either description for a term which may extend to three years, or with fine, or with both.' },

  { id: 'IPC-383', act: 'IPC', section: '383', title: 'Extortion',
    text: 'Section 383 IPC — Extortion: Whoever intentionally puts any person in fear of any injury to that person, or to any other, and thereby dishonestly induces the person so put in fear to deliver to any person any property or valuable security, or anything signed or sealed which may be converted into a valuable security, commits extortion.' },

  { id: 'IPC-390', act: 'IPC', section: '390', title: 'Robbery',
    text: 'Section 390 IPC — Robbery: In all robbery there is either theft or extortion. Theft is robbery if, in order to the committing of the theft, or in committing the theft, or in carrying away or attempting to carry away property obtained by the theft, the offender, for that end, voluntarily causes or attempts to cause to any person death or hurt or wrongful restraint, or fear of instant death or of instant hurt, or of instant wrongful restraint.' },

  { id: 'IPC-392', act: 'IPC', section: '392', title: 'Punishment for robbery',
    text: 'Section 392 IPC — Punishment for robbery: Whoever commits robbery shall be punished with rigorous imprisonment for a term which may extend to ten years, and shall also be liable to fine; and, if the robbery be committed on the highway between sunset and sunrise, the imprisonment may be extended to fourteen years.' },

  { id: 'IPC-395', act: 'IPC', section: '395', title: 'Punishment for dacoity',
    text: 'Section 395 IPC — Punishment for dacoity: Whoever commits dacoity shall be punished with imprisonment for life, or with rigorous imprisonment for a term which may extend to ten years, and shall also be liable to fine.' },

  { id: 'IPC-406', act: 'IPC', section: '406', title: 'Punishment for criminal breach of trust',
    text: 'Section 406 IPC — Punishment for criminal breach of trust: Whoever commits criminal breach of trust shall be punished with imprisonment of either description for a term which may extend to three years, or with fine, or with both.' },

  { id: 'IPC-415', act: 'IPC', section: '415', title: 'Cheating',
    text: 'Section 415 IPC — Cheating: Whoever, by deceiving any person, fraudulently or dishonestly induces the person so deceived to deliver any property to any person, or to consent that any person shall retain any property, or intentionally induces the person so deceived to do or omit to do anything which he would not do or omit if he were not so deceived, and which act or omission causes or is likely to cause damage or harm to that person in body, mind, reputation or property, is said to cheat.' },

  { id: 'IPC-420', act: 'IPC', section: '420', title: 'Cheating and dishonestly inducing delivery of property',
    text: 'Section 420 IPC — Cheating and dishonestly inducing delivery of property: Whoever cheats and thereby dishonestly induces the person deceived to deliver any property to any person, or to make, alter or destroy the whole or any part of a valuable security, or anything which is signed or sealed, and which is capable of being converted into a valuable security, shall be punished with imprisonment of either description for a term which may extend to seven years, and shall also be liable to fine.' },

  { id: 'IPC-426', act: 'IPC', section: '426', title: 'Punishment for mischief',
    text: 'Section 426 IPC — Punishment for mischief: Whoever commits mischief shall be punished with imprisonment of either description for a term which may extend to three months, or with fine, or with both.' },

  { id: 'IPC-441', act: 'IPC', section: '441', title: 'Criminal trespass',
    text: 'Section 441 IPC — Criminal trespass: Whoever enters into or upon property in the possession of another with intent to commit an offence or to intimidate, insult or annoy any person in possession of such property, or having lawfully entered into or upon such property, unlawfully remains there with intent thereby to intimidate, insult or annoy any such person, or with intent to commit an offence, is said to commit criminal trespass.' },

  { id: 'IPC-463', act: 'IPC', section: '463', title: 'Forgery',
    text: 'Section 463 IPC — Forgery: Whoever makes any false document or false electronic record or part of a document or electronic record, with intent to cause damage or injury, to the public or to any person, or to support any claim or title, or to cause any person to part with property, or to enter into any express or implied contract, or with intent to commit fraud or that fraud may be committed, commits forgery.' },

  { id: 'IPC-498A', act: 'IPC', section: '498A', title: 'Husband or relative of husband of a woman subjecting her to cruelty',
    text: 'Section 498A IPC — Husband or relative of husband of a woman subjecting her to cruelty: Whoever, being the husband or the relative of the husband of a woman, subjects such woman to cruelty shall be punished with imprisonment for a term which may extend to three years and shall also be liable to fine. Explanation: For the purpose of this section, cruelty means any wilful conduct which is of such a nature as is likely to drive the woman to commit suicide or to cause grave injury or danger to life, limb or health (whether mental or physical) of the woman; or harassment of the woman where such harassment is with a view to coercing her or any person related to her to meet any unlawful demand for any property or valuable security or is on account of failure by her or any person related to her to meet such demand.' },

  { id: 'IPC-34', act: 'IPC', section: '34', title: 'Acts done by several persons in furtherance of common intention',
    text: 'Section 34 IPC — Acts done by several persons in furtherance of common intention: When a criminal act is done by several persons in furtherance of the common intention of all, each of such persons is liable for that act in the same manner as if it were done by him alone.' },

  { id: 'IPC-120B', act: 'IPC', section: '120B', title: 'Punishment of criminal conspiracy',
    text: 'Section 120B IPC — Punishment of criminal conspiracy: Whoever is a party to a criminal conspiracy to commit an offence punishable with death, imprisonment for life or rigorous imprisonment for a term of two years or upwards, shall, where no express provision is made in this Code for the punishment of such a conspiracy, be punished in the same manner as if he had abetted such offence. Whoever is a party to a criminal conspiracy other than a criminal conspiracy to commit an offence punishable as aforesaid shall be punished with imprisonment of either description for a term not exceeding six months, or with fine or with both.' },

  // ═══════════════════════════════════════
  // CODE OF CRIMINAL PROCEDURE 1973
  // ═══════════════════════════════════════
  { id: 'CrPC-41', act: 'CrPC', section: '41', title: 'When police may arrest without warrant',
    text: 'Section 41 CrPC — When police may arrest without warrant: Any police officer may without an order from a Magistrate and without a warrant, arrest any person who has been concerned in any cognizable offence, or against whom a reasonable complaint has been made, or credible information has been received, or a reasonable suspicion exists, of his having been so concerned; or who has in his possession any implement of house-breaking; or who has been proclaimed as an offender either under this Code or by order of the State Government; or in whose possession anything is found which may reasonably be suspected to be stolen property and who may reasonably be suspected of having committed an offence with reference to such thing; or who obstructs a police officer while in the execution of his duty, or who has escaped, or attempts to escape, from lawful custody.' },

  { id: 'CrPC-154', act: 'CrPC', section: '154', title: 'Information in cognizable cases — FIR',
    text: 'Section 154 CrPC — Information in cognizable cases (FIR): Every information relating to the commission of a cognizable offence, if given orally to an officer in charge of a police station, shall be reduced to writing by him or under his direction, and be read over to the informant; and every such information, whether given in writing or reduced to writing as aforesaid, shall be signed by the person giving it, and the substance thereof shall be entered in a book to be kept by such officer in such form as the State Government may prescribe in this behalf. A copy of the information as recorded under sub-section (1) shall be given forthwith, free of cost, to the informant.' },

  { id: 'CrPC-161', act: 'CrPC', section: '161', title: 'Examination of witnesses by police',
    text: 'Section 161 CrPC — Examination of witnesses by police: Any police officer making an investigation under this Chapter, or any police officer not below such rank as the State Government may, by general or special order, prescribe in this behalf, acting on the requisition of such officer, may examine orally any person supposed to be acquainted with the facts and circumstances of the case. Such person shall be bound to answer truly all questions relating to such case put to him by such officer, other than questions the answers to which would have a tendency to expose him to a criminal charge or to a penalty or forfeiture.' },

  { id: 'CrPC-164', act: 'CrPC', section: '164', title: 'Recording of confessions and statements',
    text: 'Section 164 CrPC — Recording of confessions and statements: Any Metropolitan Magistrate or Judicial Magistrate may, whether or not he has jurisdiction in the case, record any confession or statement made to him in the course of an investigation under this Chapter or under any other law for the time being in force, or at any time afterwards before the commencement of the inquiry or trial. No confession shall be recorded by a police officer on whom any power of a Magistrate has been conferred under any law for the time being in force.' },

  { id: 'CrPC-173', act: 'CrPC', section: '173', title: 'Report of police officer on completion of investigation',
    text: 'Section 173 CrPC — Report of police officer on completion of investigation (Charge Sheet): Every investigation under this Chapter shall be completed without unnecessary delay. As soon as it is completed, the officer in charge of the police station shall forward to a Magistrate empowered to take cognizance of the offence on a police report, a report in the form prescribed by the State Government, stating the names of the parties; the nature of the information; the names of the persons who appear to have been acquainted with the circumstances of the case; whether any offence appears to have been committed and, if so, by whom; whether the accused has been arrested; whether he has been released on his bond and, if so, whether with or without sureties; and whether he has been forwarded in custody under section 170.' },

  { id: 'CrPC-197', act: 'CrPC', section: '197', title: 'Prosecution of Judges and public servants',
    text: 'Section 197 CrPC — Prosecution of Judges and public servants: When any person who is or was a Judge or Magistrate or a public servant not removable from his office save by or with the sanction of the Government is accused of any offence alleged to have been committed by him while acting or purporting to act in the discharge of his official duty, no Court shall take cognizance of such offence except with the previous sanction of the Government.' },

  { id: 'CrPC-313', act: 'CrPC', section: '313', title: 'Power to examine the accused',
    text: 'Section 313 CrPC — Power to examine the accused: In every inquiry or trial, for the purpose of enabling the accused personally to explain any circumstances appearing in the evidence against him, the Court may at any stage, without previously warning the accused, put such questions to him as the Court considers necessary, and shall, after the witnesses for the prosecution have been examined and before he is called on for his defence, question him generally on the case. The accused shall not render himself liable to punishment by refusing to answer such questions, or by giving false answers to them; but the Court and the jury, if any, may draw such inference from such refusal or answers as it thinks just.' },

  { id: 'CrPC-357', act: 'CrPC', section: '357', title: 'Order to pay compensation',
    text: 'Section 357 CrPC — Order to pay compensation: When a Court imposes a sentence of fine or a sentence of which fine forms a part, the Court may, when passing judgment, order the whole or any part of the fine recovered to be applied in payment of compensation for any loss or injury caused by the offence, when compensation is, in the opinion of the Court, recoverable by such person in a Civil Court.' },

  { id: 'CrPC-374', act: 'CrPC', section: '374', title: 'Appeals from convictions',
    text: 'Section 374 CrPC — Appeals from convictions: Any person convicted on a trial held by a High Court in its extraordinary original criminal jurisdiction may appeal to the Supreme Court. Any person convicted on a trial held by a Sessions Judge or an Additional Sessions Judge or on a trial held by any other Court in which a sentence of imprisonment for more than seven years has been passed against him or against any other person convicted at the same trial, may appeal to the High Court.' },

  { id: 'CrPC-427', act: 'CrPC', section: '427', title: 'Sentence on offender already sentenced for another offence',
    text: 'Section 427 CrPC — Sentence on offender already sentenced for another offence: When a person already undergoing a sentence of imprisonment is sentenced on a subsequent conviction to imprisonment or imprisonment for life, such imprisonment or imprisonment for life shall commence at the expiration of the imprisonment to which he has been previously sentenced, unless the Court directs that the subsequent sentence shall run concurrently with such previous sentence.' },

  { id: 'CrPC-437', act: 'CrPC', section: '437', title: 'When bail may be taken in case of non-bailable offence',
    text: 'Section 437 CrPC — When bail may be taken in case of non-bailable offence: When any person accused of, or suspected of, the commission of any non-bailable offence is arrested or detained without warrant by an officer in charge of a police station or appears or is brought before a Court other than the High Court or Court of Session, he may be released on bail, but such person shall not be so released if there appear reasonable grounds for believing that he has been guilty of an offence punishable with death or imprisonment for life. Provided that the Court may direct that any person under the age of sixteen years or any woman or any sick or infirm person accused of such an offence be released on bail.' },

  { id: 'CrPC-438', act: 'CrPC', section: '438', title: 'Direction for grant of bail to person apprehending arrest — Anticipatory bail',
    text: 'Section 438 CrPC — Direction for grant of bail to person apprehending arrest (Anticipatory Bail): When any person has reason to believe that he may be arrested on accusation of having committed a non-bailable offence, he may apply to the High Court or the Court of Session for a direction under this section that in the event of such arrest he shall be released on bail; and that Court may, after taking into consideration, inter alia, the nature and gravity of the accusation; the antecedents of the applicant including the fact as to whether he has previously undergone imprisonment on conviction by a Court in respect of any cognizable offence; the possibility of the applicant to flee from justice; and where the accusation appears to have been made with the object of injuring or humiliating the applicant by having him so arrested, either reject the application forthwith or issue an interim order for the grant of anticipatory bail.' },

  { id: 'CrPC-439', act: 'CrPC', section: '439', title: 'Special powers of High Court or Court of Session regarding bail',
    text: 'Section 439 CrPC — Special powers of High Court or Court of Session regarding bail: A High Court or Court of Session may direct that any person accused of an offence and in custody be released on bail, and if the offence is of the nature specified in sub-section (3) of section 437, may impose any condition which it considers necessary for the purposes mentioned in that sub-section; that any condition imposed by a Magistrate when releasing any person on bail be set aside or modified.' },

  { id: 'CrPC-482', act: 'CrPC', section: '482', title: 'Saving of inherent powers of High Court',
    text: 'Section 482 CrPC — Saving of inherent powers of High Court: Nothing in this Code shall be deemed to limit or affect the inherent powers of the High Court to make such orders as may be necessary to give effect to any order under this Code, or to prevent abuse of the process of any Court or otherwise to secure the ends of justice.' },

  // ═══════════════════════════════════════
  // INDIAN EVIDENCE ACT 1872
  // ═══════════════════════════════════════
  { id: 'IEA-3', act: 'IEA', section: '3', title: 'Interpretation clause — Definitions',
    text: 'Section 3 IEA — Interpretation clause: In this Act the following words and expressions are used in the following senses, unless a contrary intention appears from the context. "Court" includes all Judges and Magistrates, and all persons, except arbitrators, legally authorised to take evidence. "Fact" means and includes any thing, state of things, or relation of things, capable of being perceived by the senses; any mental condition of which any person is conscious. "Relevant" — One fact is said to be relevant to another when the one is connected with the other in any of the ways referred to in the provisions of this Act relating to the relevancy of facts. "Facts in issue" means and includes any fact from which, either by itself or in connection with other facts, the existence, non-existence, nature, or extent of any right, liability, or disability, asserted or denied in any suit or proceeding, necessarily follows. "Document" means any matter expressed or described upon any substance by means of letters, figures, or marks, or by more than one of those means, intended to be used, or which may be used, for the purpose of recording that matter.' },

  { id: 'IEA-17', act: 'IEA', section: '17', title: 'Admission defined',
    text: 'Section 17 IEA — Admission defined: An admission is a statement, oral or documentary or contained in electronic form, which suggests any inference as to any fact in issue or relevant fact, and which is made by any of the persons, and under the circumstances, hereinafter mentioned.' },

  { id: 'IEA-24', act: 'IEA', section: '24', title: 'Confession caused by inducement threat or promise when irrelevant',
    text: 'Section 24 IEA — Confession caused by inducement, threat or promise when irrelevant in criminal proceeding: A confession made by an accused person is irrelevant in a criminal proceeding, if the making of the confession appears to the Court to have been caused by any inducement, threat or promise having reference to the charge against the accused person, proceeding from a person in authority and sufficient, in the opinion of the Court, to give the accused person grounds which would appear to him reasonable for supposing that by making it he would gain any advantage or avoid any evil of a temporal nature in reference to the proceedings against him.' },

  { id: 'IEA-25', act: 'IEA', section: '25', title: 'Confession to police officer not to be proved',
    text: 'Section 25 IEA — Confession to police officer not to be proved: No confession made to a police officer shall be proved as against a person accused of any offence.' },

  { id: 'IEA-27', act: 'IEA', section: '27', title: 'How much of information received from accused may be proved',
    text: 'Section 27 IEA — How much of information received from accused may be proved: Provided that, when any fact is deposed to as discovered in consequence of information received from a person accused of any offence, in the custody of a police officer, so much of such information, whether it amounts to a confession or not, as relates distinctly to the fact thereby discovered, may be proved.' },

  { id: 'IEA-45', act: 'IEA', section: '45', title: 'Opinions of experts',
    text: 'Section 45 IEA — Opinions of experts: When the Court has to form an opinion upon a point of foreign law or of science or art, or as to identity of handwriting or finger impressions, the opinions upon that point of persons specially skilled in such foreign law, science or art, or in questions as to identity of handwriting or finger impressions are relevant facts. Such persons are called experts.' },

  { id: 'IEA-65B', act: 'IEA', section: '65B', title: 'Admissibility of electronic records',
    text: 'Section 65B IEA — Admissibility of electronic records: Notwithstanding anything contained in this Act, any information contained in an electronic record which is printed on a paper, stored, recorded or copied in optical or magnetic media produced by a computer shall be deemed to be also a document, if the conditions mentioned in this section are satisfied in relation to the information and computer in question and shall be admissible in any proceedings, without further proof or production of the original, as evidence of any contents of the original or of any fact stated therein of which direct evidence would be admissible. The conditions referred to in sub-section (1) in respect of a computer output shall be: the computer output containing the information was produced by the computer during the period over which the computer was used regularly to store or process information for the purposes of any activities regularly carried on over that period by the person having lawful control over the use of the computer; during the said period, information of the kind contained in the electronic record or of the kind from which the information so contained is derived was regularly fed into the computer in the ordinary course of the said activities.' },

  { id: 'IEA-101', act: 'IEA', section: '101', title: 'Burden of proof',
    text: 'Section 101 IEA — Burden of proof: Whoever desires any Court to give judgment as to any legal right or liability dependent on the existence of facts which he asserts, must prove that those facts exist. When a person is bound to prove the existence of any fact, it is said that the burden of proof lies on that person.' },

  { id: 'IEA-102', act: 'IEA', section: '102', title: 'On whom burden of proof lies',
    text: 'Section 102 IEA — On whom burden of proof lies: The burden of proof in a suit or proceeding lies on that person who would fail if no evidence at all were given on either side.' },

  { id: 'IEA-105', act: 'IEA', section: '105', title: 'Burden of proving that case of accused comes within exceptions',
    text: 'Section 105 IEA — Burden of proving that case of accused comes within exceptions: When a person is accused of any offence, the burden of proving the existence of circumstances bringing the case within any of the General Exceptions in the Indian Penal Code, or within any special exception or proviso contained in any other part of the same Code, or in any law defining the offence, is upon him, and the Court shall presume the absence of such circumstances.' },

  { id: 'IEA-112', act: 'IEA', section: '112', title: 'Birth during marriage conclusive proof of legitimacy',
    text: 'Section 112 IEA — Birth during marriage conclusive proof of legitimacy: The fact that any person was born during the continuance of a valid marriage between his mother and any man, or within two hundred and eighty days after its dissolution, the mother remaining unmarried, shall be conclusive proof that he is the legitimate son of that man, unless it can be shown that the parties to the marriage had no access to each other at any time when he could have been begotten.' },

  { id: 'IEA-113B', act: 'IEA', section: '113B', title: 'Presumption as to dowry death',
    text: 'Section 113B IEA — Presumption as to dowry death: When the question is whether a person has committed the dowry death of a woman and it is shown that soon before her death such woman had been subjected by such person to cruelty or harassment for, or in connection with, any demand for dowry, the Court shall presume that such person had caused the dowry death. For the purpose of this section, dowry death shall have the same meaning as in section 304B of the Indian Penal Code.' },

  { id: 'IEA-118', act: 'IEA', section: '118', title: 'Who may testify',
    text: 'Section 118 IEA — Who may testify: All persons shall be competent to testify unless the Court considers that they are prevented from understanding the questions put to them, or from giving rational answers to those questions, by tender years, extreme old age, disease, whether of body or mind, or any other cause of the same kind. Explanation: A lunatic is not incompetent to testify, unless he is prevented by his lunacy from understanding the questions put to him and giving rational answers to them.' },

  { id: 'IEA-145', act: 'IEA', section: '145', title: 'Cross-examination as to previous statements in writing',
    text: 'Section 145 IEA — Cross-examination as to previous statements in writing: A witness may be cross-examined as to previous statements made by him in writing or reduced into writing, and relevant to matters in question, without such writing being shown to him, or being proved; but, if it is intended to contradict him by the writing, his attention must, before the writing can be proved, be called to those parts of it which are to be used for the purpose of contradicting him.' },

];

// ── EMBED WITH NOMIC ──────────────────────
async function embedTexts(texts) {
  const response = await fetch('https://api-atlas.nomic.ai/v1/embedding/text', {
    method: 'POST',
    headers: {
      'Content-Type':  'application/json',
      'Authorization': 'Bearer ' + NOMIC_API_KEY
    },
    body: JSON.stringify({
      model:      'nomic-embed-text-v1.5',
      texts:      texts,
      task_type:  'search_document'
    })
  });

  if (!response.ok) {
    const err = await response.text();
    throw new Error('Nomic API error ' + response.status + ': ' + err);
  }

  const data = await response.json();
  return data.embeddings;
}

// ── UPLOAD TO PINECONE ────────────────────
async function uploadToPinecone(vectors) {
  const response = await fetch(INDEX_HOST + '/vectors/upsert', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Api-Key':      PINECONE_API_KEY
    },
    body: JSON.stringify({ vectors, namespace: 'indian-law' })
  });

  if (!response.ok) {
    const err = await response.text();
    throw new Error('Pinecone upsert error ' + response.status + ': ' + err);
  }

  return await response.json();
}

// ── MAIN ──────────────────────────────────
async function main() {
  console.log('LexArena RAG — Law Upload Script');
  console.log('Sections to upload:', LAW_SECTIONS.length);
  console.log('─────────────────────────────────');

  // Process in batches to avoid rate limits
  for (let i = 0; i < LAW_SECTIONS.length; i += BATCH_SIZE) {
    const batch = LAW_SECTIONS.slice(i, i + BATCH_SIZE);
    console.log(`\nBatch ${Math.floor(i/BATCH_SIZE) + 1}: sections ${i+1}–${Math.min(i+BATCH_SIZE, LAW_SECTIONS.length)}`);

    // Step 1: Embed all texts in batch
    console.log('  Embedding with Nomic...');
    const texts      = batch.map(s => s.act + ' Section ' + s.section + ' — ' + s.title + ': ' + s.text);
    const embeddings = await embedTexts(texts);
    console.log('  Embeddings received:', embeddings.length);

    // Step 2: Build Pinecone vectors
    const vectors = batch.map((section, idx) => ({
      id:       section.id,
      values:   embeddings[idx],
      metadata: {
        act:     section.act,
        section: section.section,
        title:   section.title,
        text:    section.text
      }
    }));

    // Step 3: Upsert to Pinecone
    console.log('  Uploading to Pinecone...');
    const result = await uploadToPinecone(vectors);
    console.log('  Upserted:', result.upsertedCount || batch.length, 'vectors');

    // Rate limit pause between batches
    if (i + BATCH_SIZE < LAW_SECTIONS.length) {
      console.log('  Pausing 2s...');
      await new Promise(r => setTimeout(r, 2000));
    }
  }

  console.log('\n─────────────────────────────────');
  console.log('Upload complete!', LAW_SECTIONS.length, 'sections in Pinecone.');
  console.log('Index:', INDEX_NAME, '| Namespace: indian-law');
}

main().catch(err => {
  console.error('\nFATAL ERROR:', err.message);
  process.exit(1);
});