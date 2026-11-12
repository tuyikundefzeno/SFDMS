import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react';
import {
  AlertCircle,
  Bot,
  Check,
  CheckCircle2,
  Clipboard,
  FileDown,
  RefreshCw,
  Send,
  Sparkles,
} from 'lucide-react';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { formatCurrency } from '../lib/constants';
import { supabase } from '../lib/supabase';

type Language = 'English' | 'Kinyarwanda' | 'French';
type RiskLevel = 'Low' | 'Medium' | 'High';

interface RiskStudent {
  studentId: string;
  studentName: string;
  admissionNumber: string;
  classId: string;
  className: string;
  amountPaid: number;
  amountRemaining: number;
  risk: RiskLevel;
}

interface PaymentIssue {
  id: string;
  studentName: string;
  className: string;
  amount: number;
  paidAt: string | null;
  reason: string;
  checked: boolean;
}

interface LowPaymentStudent {
  studentId: string;
  studentName: string;
  admissionNumber: string;
  classId: string;
  className: string;
  amountPaid: number;
  amountRequired: number;
  amountRemaining: number;
  percentagePaid: number;
}

interface InsightOverview {
  semester: { id: string; name: string; start_date: string; end_date: string };
  collected: number;
  expected: number;
  unpaid: number;
  percentageCollected: number;
  classes: { id: string; name: string; collected: number; expected: number }[];
  highestClass: string | null;
  lowestClass: string | null;
  risks: RiskStudent[];
  lowPaymentLimit: number;
  lowPaymentStudents: LowPaymentStudent[];
  prediction: {
    collected: number;
    predicted: number;
    expected: number;
    explanation: string;
    historicalSemesters: number;
  };
  issues: PaymentIssue[];
  summary: string | null;
  empty?: boolean;
  error?: string;
}

interface ChatReply {
  answer: string;
  rows: { student: string; class: string; amountPaid: number; amountRemaining: number }[];
}

const languages: Language[] = ['English', 'Kinyarwanda', 'French'];
const translations: Record<Exclude<Language, 'English'>, Record<string, string>> = {
  Kinyarwanda: {
    'Helpful school data, made clearer': 'Amakuru y’ishuri asobanutse neza',
    'AI Insights': 'Isesengura ry’amakuru',
    'Current semester: {semester}': 'Igihembwe kiriho: {semester}',
    'Understand payments and spot what needs attention.': 'Sobanukirwa n’amafaranga yatanzwe n’ibikeneye kwitabwaho.',
    Language: 'Ururimi',
    'AI gives suggestions. Please check before you act.': 'AI itanga inama. Banza uzigenzure mbere yo kugira icyo ukora.',
    'Try again': 'Ongera ugerageze',
    'Loading school insights…': 'Amakuru y’isesengura arimo gutegurwa…',
    'No semester yet': 'Nta gihembwe kirashyirwaho',
    'No students yet': 'Nta banyeshuri barashyirwaho',
    'Add students to see insights.': 'Ongeramo abanyeshuri kugira ngo ubone isesengura.',
    'AI summary': 'Incamake ya AI',
    'A simple snapshot of the current semester.': 'Incamake y’igihembwe kiriho.',
    'Refresh summary': 'Vugurura incamake',
    'AI summary is unavailable. Check the setup message above, then try again.': 'Incamake ya AI ntibonetse. Reba ubutumwa bwo hejuru, wongere ugerageze.',
    'Total collected': 'Amafaranga yose yakusanyijwe',
    'Total unpaid': 'Amafaranga yose atarishyurwa',
    'Collection progress': 'Ijanisha ry’amafaranga yakusanyijwe',
    'Students at risk': 'Abanyeshuri bashobora kutishyura',
    'Payment follow-up': 'Gukurikirana ubwishyu',
    'Parent/guardian follow-up list': 'Urutonde rwo kuganira n’ababyeyi',
    'Students who have paid more than RWF 0 and no more than {amount} toward their current-semester fee, based on recorded payments.': 'Abanyeshuri bishyuye amafaranga arenga RWF 0 ariko atarenze {amount} y’igihembo cy’iki gihembwe, hakurikijwe inyandiko z’ubwishyu.',
    'Filter by class': 'Shungura hakurikijwe ishuri',
    'All classes': 'Amashuri yose',
    'Download / print PDF': 'Kuramo / capisha PDF',
    'No students match this payment range.': 'Nta banyeshuri bahuye n’uru rwego rw’ubwishyu.',
    'Students with no recorded payments are shown in the early-warning list instead.': 'Abatarishyura na rimwe bagaragara ku rutonde rw’imburira gihe.',
    '{count} student(s) to follow up': 'Abanyeshuri {count} bagomba gukurikiranwa',
    '{semester} · verify records before contacting families': '{semester} · genzura inyandiko mbere yo kuvugana n’imiryango',
    Student: 'Umunyeshuri',
    'Admission no.': 'Nimero yo kwiyandikisha',
    Class: 'Ishuri',
    Paid: 'Yishyuye',
    Fee: 'Amafaranga asabwa',
    Balance: 'Asigaye',
    Progress: 'Ijanisha',
    'Individual PDF': 'PDF y’umunyeshuri',
    'Student PDF': 'PDF y’umunyeshuri',
    'Download individual follow-up PDF for {name}': 'Kuramo PDF yo gukurikirana {name}',
    'This is a payment-record follow-up aid, not a disciplinary list. Please confirm each record and speak with families respectfully.': 'Uru rutonde rugamije gukurikirana ubwishyu, si urutonde rw’ibihano. Banza ugenzure inyandiko kandi uvugane n’imiryango mu cyubahiro.',
    'Early warning for late payers': 'Imburira ku batinda kwishyura',
    'A guide based on this semester’s payments and past semester records.': 'Isesengura rishingiye ku bwishyu bw’iki gihembwe n’ubw’ibihembwe byabanje.',
    'Risk level': 'Urwego rw’ingaruka',
    'All levels': 'Inzego zose',
    High: 'Hejuru',
    Medium: 'Hagati',
    Low: 'Hasi',
    'No students match these filters. There are no payment warnings to show.': 'Nta banyeshuri bahuye n’ibi byatoranyijwe. Nta mburira y’ubwishyu ihari.',
    Remaining: 'Asigaye',
    Risk: 'Ingaruka',
    Reminder: 'Ubutumwa',
    'Write reminder': 'Andika ubutumwa',
    'Reminder deadline': 'Itariki ntarengwa yo kwishyura',
    'Default is the semester end date. Adjust to your school’s deadline.': 'Itariki isanzwe ni umunsi igihembwe kirangiriraho. Hindura uyishyire ku itariki y’ishuri.',
    'Message tone': 'Imvugo y’ubutumwa',
    Friendly: 'Gicuti',
    Formal: 'Rasmi',
    'Messages are drafts only. A teacher must review and send them.': 'Ubu ni ubutumwa bw’umushinga gusa. Umwarimu agomba kubusuzuma no kubwohereza.',
    'Reminder draft': 'Umushinga w’ubutumwa',
    Close: 'Funga',
    'Writing a polite reminder…': 'Arimo gutegura ubutumwa bwubashye…',
    'Edit reminder message': 'Hindura ubutumwa bwo kwibutsa',
    Copied: 'Byakoporowe',
    Copy: 'Koporora',
    'Download reminder as PDF': 'Kuramo ubutumwa bwo kwibutsa muri PDF',
    'Ask in normal words': 'Baza ukoresheje amagambo asanzwe',
    'Ask about this semester’s payment records.': 'Baza ibijyanye n’inyandiko z’ubwishyu z’iki gihembwe.',
    'Who has paid? Who has not paid in Senior 3?': 'Ni bande bishyuye? Ni bande batishyuye mu mwaka wa 3 w’ayisumbuye?',
    Ask: 'Baza',
    'Checking the payment records…': 'Arimo kugenzura inyandiko z’ubwishyu…',
    'Semester prediction': 'Iteganyagihe ry’igihembwe',
    'Estimate, not a fact': 'Ni ikigereranyo, si ukuri kwemejwe',
    'Collected so far': 'Ayakusanyijwe kugeza ubu',
    'Estimated total': 'Igiteranyo giteganyijwe',
    'Compared with {count} previous semester(s).': 'Bigereranyijwe n’ibihembwe {count} byabanje.',
    'No completed previous semesters were found.': 'Nta bihembwe byabanje byarangiye byabonetse.',
    'Mistake checker': 'Genzura amakosa',
    'Possible issues to review. Nothing is changed or deleted automatically.': 'Ibibazo bishoboka bigomba gusuzumwa. Nta kintu gihindurwa cyangwa ngo gisibwe ubwacyo.',
    '{count} record(s) to check': 'Inyandiko {count} zigomba kugenzurwa',
    'No possible payment mistakes were found.': 'Nta makosa ashoboka mu bwishyu yabonetse.',
    Amount: 'Amafaranga',
    Date: 'Itariki',
    'Possible issue': 'Ikibazo gishoboka',
    Review: 'Isuzuma',
    Missing: 'Ntiboneka',
    Checked: 'Byagenzuwe',
    'Saving…': 'Irimo kubikwa…',
    'Mark as checked': 'Shyira ko byagenzuwe',
    'Total paid': 'Ayishyuwe yose',
    'Semester fee': 'Amafaranga y’igihembwe',
    'Balance remaining': 'Amafaranga asigaye',
    Semester: 'Igihembwe',
    'Student Contribution Follow-Up': 'Gukurikirana ubwishyu bw’umunyeshuri',
    'Individual student contribution follow-up': 'Gukurikirana ubwishyu bw’umunyeshuri umwe',
    'Payment reminder': 'Ubutumwa bwo kwibutsa kwishyura',
    'Parent/guardian payment reminder': 'Ubutumwa bwo kwibutsa umubyeyi kwishyura',
    'Amount remaining: {amount}': 'Amafaranga asigaye: {amount}',
    'Please review this reminder before sending.': 'Banza usuzume ubu butumwa mbere yo kubwohereza.',
    'This is a draft only. A teacher must review it and deliver it to the parent/guardian.': 'Ubu ni ubutumwa bw’umushinga gusa. Umwarimu agomba kubusuzuma no kubugeza ku mubyeyi.',
    'Low Payment Follow-Up': 'Gukurikirana ubwishyu buri hasi',
    'Student contribution follow-up list': 'Urutonde rwo gukurikirana ubwishyu bw’abanyeshuri',
    'Paid %': 'Yishyuye %',
    'Generated {date}': 'Byakozwe ku wa {date}',
    'Parent / guardian meeting record': 'Inyandiko y’inama n’umubyeyi',
    'SEMESTER CONTRIBUTION SUMMARY': 'INCAMAKE Y’UBWISHYU BW’IGIHEMBWE',
    'Contribution recorded': 'Amafaranga yishyuwe',
    'Meeting request': 'Ubutumire bw’inama',
    'Please visit the school with your parent or guardian to review this semester’s school-feeding contribution and discuss any questions about the recorded balance.': 'Sura ishuri uri kumwe n’umubyeyi cyangwa umurera kugira ngo musuzume ubwishyu bw’amafunguro y’iki gihembwe kandi muganire ku bibazo byose byerekeye amafaranga asigaye.',
    'This notice is based on recorded payments. Please contact the school if a payment is missing or incorrect.': 'Ubu butumwa bushingiye ku bwishyu bwanditswe. Baza ishuri niba hari ubwishyu butagaragara cyangwa butanditswe neza.',
    'Parent / guardian signature and date': 'Umukono w’umubyeyi n’itariki',
    'School representative and date': 'Uhagarariye ishuri n’itariki',
    'Please handle student information confidentially': 'Bika amakuru y’umunyeshuri mu ibanga',
    'Supportive parent/guardian meeting list': 'Urutonde rwo kuganira n’ababyeyi mu buryo bubafasha',
    'Students with a payment above RWF 0 and up to RWF {limit} of their semester fee.': 'Abanyeshuri bishyuye arenga RWF 0 ariko atarenze RWF {limit} y’amafaranga y’igihembwe.',
    'Please confirm records and invite a parent/guardian to discuss contribution support.': 'Genzura inyandiko kandi utumire umubyeyi kugira ngo muganire ku bufasha bw’ubwishyu.',
    'Totals ({count})': 'Igiteranyo ({count})',
    'Verify payment records before follow-up': 'Genzura inyandiko z’ubwishyu mbere yo gukurikirana',
    'No semester is set up yet. Add a semester to see insights.': 'Nta gihembwe kirashyirwaho. Ongeramo igihembwe kugira ngo ubone isesengura.',
    'Page {page} of {total}': 'Urupapuro {page} kuri {total}',
    'Semester: {semester}': 'Igihembwe: {semester}',
    'No current-semester payments are recorded for the selected group.': 'Nta bwishyu bw’iki gihembwe bwanditswe kuri iri tsinda.',
    'This estimate uses the collection pace so far. It will improve when previous semester records are available.': 'Iki kigereranyo gishingiye ku mafaranga yakusanyijwe kugeza ubu. Kizarushaho kuba cyiza igihe inyandiko z’ibihembwe byabanje zizaboneka.',
    'This estimate combines the current collection pace with average collections from previous semesters.': 'Iki kigereranyo gihuza umuvuduko w’amafaranga ari gukusanywa ubu n’impuzandengo y’ibihembwe byabanje.',
    'Payment date is missing': 'Itariki y’ubwishyu ntiboneka',
    'Student record could not be found': 'Inyandiko y’umunyeshuri ntiyabonetse',
    'Semester record could not be found': 'Inyandiko y’igihembwe ntiyabonetse',
    'Possible duplicate: same student, amount, semester, and date': 'Bishobora kuba byarishyuwe kabiri: umunyeshuri, amafaranga, igihembwe n’itariki birasa',
    'Student semester total ({paid} RWF) is above the {required} RWF fee': 'Amafaranga yose umunyeshuri yishyuye mu gihembwe ({paid} RWF) arenga amafaranga asabwa ({required} RWF)',
    'AI is not configured. Add GEMINI_API_KEY to the server environment and redeploy.': 'AI ntiyashyizweho. Ongeramo GEMINI_API_KEY mu ibanga rya seriveri wongere ushyireho porogaramu.',
    'The AI provider rejected its API key. Verify GEMINI_API_KEY and enable the Gemini API for that key.': 'Serivisi ya AI yanze urufunguzo rwa API. Genza GEMINI_API_KEY kandi ufungurire urwo rufunguzo Gemini API.',
    'The AI provider quota was exceeded. Check your Gemini API quota and billing settings.': 'Umubare ntarengwa wa Gemini API wararenzwe. Genza quota n’uburyo bwo kwishyura.',
    'This Gemini API key has no text-generation models available. Enable Gemini API access or check the key’s model availability.': 'Iri rufunguzo rya Gemini API nta cyitegererezo kibasha gukora inyandiko rifite. Fungura Gemini API cyangwa ugenzure ibyitegererezo uru rufunguzo rwemerewe.',
    'Gemini could not find a usable model for this API key. Remove GEMINI_MODEL to use automatic model selection, or set it to a model available to your key, then redeploy.': 'Gemini ntiyabonye icyitegererezo gishobora gukoreshwa n’uru rufunguzo. Kuraho GEMINI_MODEL ukoreshe ihitamo ryikora, cyangwa uyishyire ku cyitegererezo uru rufunguzo rwemerewe, wongere ushyireho porogaramu.',
    'Could not load school data. Check the Supabase configuration and try again.': 'Ntibyashobotse kubona amakuru y’ishuri. Genza imiterere ya Supabase wongere ugerageze.',
    'There is not enough matching payment data.': 'Nta makuru ahagije ajyanye n’ubwishyu yabonetse.',
    'The AI API is not running. Start the app with `vercel dev`; `npm run dev` does not run API functions.': 'Serivisi ya AI API ntikora. Tangiza porogaramu ukoresheje `vercel dev`; `npm run dev` ntitangiza API functions.',
    'The AI API returned an unexpected response. Check that the Vercel API function deployed successfully.': 'AI API yagaruye igisubizo kititezwe. Reba niba Vercel API function yashyizweho neza.',
    'AI is not available now, please try again.': 'AI ntiboneka ubu, ongera ugerageze.',
    'Please sign in again to use AI Insights.': 'Ongera winjire kugira ngo ukoreshe isesengura rya AI.',
    'Could not copy the reminder. Please select and copy it manually.': 'Ntibyashobotse gukoporora ubutumwa. Butoranye maze ubukoporore n’intoki.',
    'Could not mark this record as checked.': 'Ntibyashobotse gushyira iyi nyandiko mu zagenzuwe.',
  },
  French: {
    'Helpful school data, made clearer': 'Les données scolaires, en toute clarté',
    'AI Insights': 'Analyses IA',
    'Current semester: {semester}': 'Semestre en cours : {semester}',
    'Understand payments and spot what needs attention.': 'Suivez les paiements et repérez les points à traiter.',
    Language: 'Langue',
    'AI gives suggestions. Please check before you act.': 'L’IA propose des suggestions. Vérifiez-les avant toute action.',
    'Try again': 'Réessayer',
    'Loading school insights…': 'Chargement des analyses…',
    'No semester yet': 'Aucun semestre pour le moment',
    'No students yet': 'Aucun élève pour le moment',
    'Add students to see insights.': 'Ajoutez des élèves pour afficher les analyses.',
    'AI summary': 'Résumé IA',
    'A simple snapshot of the current semester.': 'Un aperçu du semestre en cours.',
    'Refresh summary': 'Actualiser le résumé',
    'AI summary is unavailable. Check the setup message above, then try again.': 'Résumé IA indisponible. Consultez le message ci-dessus, puis réessayez.',
    'Total collected': 'Total collecté',
    'Total unpaid': 'Total impayé',
    'Collection progress': 'Progression des collectes',
    'Students at risk': 'Élèves à risque',
    'Payment follow-up': 'Suivi des paiements',
    'Parent/guardian follow-up list': 'Liste de suivi des parents/tuteurs',
    'Students who have paid more than RWF 0 and no more than {amount} toward their current-semester fee, based on recorded payments.': 'Élèves ayant versé plus de 0 RWF et au maximum {amount} pour le semestre en cours, selon les paiements enregistrés.',
    'Filter by class': 'Filtrer par classe',
    'All classes': 'Toutes les classes',
    'Download / print PDF': 'Télécharger / imprimer le PDF',
    'No students match this payment range.': 'Aucun élève ne correspond à cette tranche de paiement.',
    'Students with no recorded payments are shown in the early-warning list instead.': 'Les élèves sans paiement enregistré figurent dans la liste d’alerte.',
    '{count} student(s) to follow up': '{count} élève(s) à suivre',
    '{semester} · verify records before contacting families': '{semester} · vérifiez les données avant de contacter les familles',
    Student: 'Élève',
    'Admission no.': 'N° d’admission',
    Class: 'Classe',
    Paid: 'Versé',
    Fee: 'Frais',
    Balance: 'Solde',
    Progress: 'Progression',
    'Individual PDF': 'PDF individuel',
    'Student PDF': 'PDF de l’élève',
    'Download individual follow-up PDF for {name}': 'Télécharger le PDF de suivi de {name}',
    'This is a payment-record follow-up aid, not a disciplinary list. Please confirm each record and speak with families respectfully.': 'Cette liste sert au suivi des paiements et n’est pas disciplinaire. Vérifiez les données et échangez avec les familles avec respect.',
    'Early warning for late payers': 'Alerte précoce des retards de paiement',
    'A guide based on this semester’s payments and past semester records.': 'Un indicateur basé sur les paiements du semestre et les périodes précédentes.',
    'Risk level': 'Niveau de risque',
    'All levels': 'Tous les niveaux',
    High: 'Élevé',
    Medium: 'Moyen',
    Low: 'Faible',
    'No students match these filters. There are no payment warnings to show.': 'Aucun élève ne correspond à ces filtres. Aucune alerte de paiement.',
    Remaining: 'Restant',
    Risk: 'Risque',
    Reminder: 'Rappel',
    'Write reminder': 'Rédiger un rappel',
    'Reminder deadline': 'Date limite du rappel',
    'Default is the semester end date. Adjust to your school’s deadline.': 'La date de fin du semestre est utilisée par défaut. Adaptez-la à la date limite de l’école.',
    'Message tone': 'Ton du message',
    Friendly: 'Amical',
    Formal: 'Formel',
    'Messages are drafts only. A teacher must review and send them.': 'Les messages sont des brouillons. Un enseignant doit les vérifier et les envoyer.',
    'Reminder draft': 'Brouillon du rappel',
    Close: 'Fermer',
    'Writing a polite reminder…': 'Rédaction d’un rappel courtois…',
    'Edit reminder message': 'Modifier le rappel',
    Copied: 'Copié',
    Copy: 'Copier',
    'Download reminder as PDF': 'Télécharger le rappel en PDF',
    'Ask in normal words': 'Poser une question simplement',
    'Ask about this semester’s payment records.': 'Posez une question sur les paiements de ce semestre.',
    'Who has paid? Who has not paid in Senior 3?': 'Qui a payé ? Qui n’a pas payé en Senior 3 ?',
    Ask: 'Demander',
    'Checking the payment records…': 'Vérification des paiements…',
    'Semester prediction': 'Prévision du semestre',
    'Estimate, not a fact': 'Estimation, pas un fait',
    'Collected so far': 'Collecté à ce jour',
    'Estimated total': 'Total estimé',
    'Compared with {count} previous semester(s).': 'Comparaison avec {count} semestre(s) précédent(s).',
    'No completed previous semesters were found.': 'Aucun semestre précédent terminé trouvé.',
    'Mistake checker': 'Vérification des erreurs',
    'Possible issues to review. Nothing is changed or deleted automatically.': 'Anomalies éventuelles à vérifier. Aucune donnée n’est modifiée ou supprimée automatiquement.',
    '{count} record(s) to check': '{count} enregistrement(s) à vérifier',
    'No possible payment mistakes were found.': 'Aucune erreur de paiement potentielle trouvée.',
    Amount: 'Montant',
    Date: 'Date',
    'Possible issue': 'Anomalie possible',
    Review: 'Vérification',
    Missing: 'Manquante',
    Checked: 'Vérifié',
    'Saving…': 'Enregistrement…',
    'Mark as checked': 'Marquer comme vérifié',
    'Total paid': 'Total versé',
    'Semester fee': 'Frais du semestre',
    'Balance remaining': 'Solde restant',
    Semester: 'Semestre',
    'Student Contribution Follow-Up': 'Suivi de la contribution de l’élève',
    'Individual student contribution follow-up': 'Suivi individuel de la contribution',
    'Payment reminder': 'Rappel de paiement',
    'Parent/guardian payment reminder': 'Rappel de paiement au parent/tuteur',
    'Amount remaining: {amount}': 'Solde restant : {amount}',
    'Please review this reminder before sending.': 'Veuillez vérifier ce rappel avant de l’envoyer.',
    'This is a draft only. A teacher must review it and deliver it to the parent/guardian.': 'Ceci est un brouillon. Un enseignant doit le vérifier et le remettre au parent/tuteur.',
    'Low Payment Follow-Up': 'Suivi des paiements faibles',
    'Student contribution follow-up list': 'Liste de suivi des contributions des élèves',
    'Paid %': 'Versé %',
    'Generated {date}': 'Généré le {date}',
    'Parent / guardian meeting record': 'Avis de rencontre avec le parent/tuteur',
    'SEMESTER CONTRIBUTION SUMMARY': 'RÉCAPITULATIF DES FRAIS DU SEMESTRE',
    'Contribution recorded': 'Montant versé',
    'Meeting request': 'Demande de rencontre',
    'Please visit the school with your parent or guardian to review this semester’s school-feeding contribution and discuss any questions about the recorded balance.': 'Veuillez venir à l’école avec votre parent ou tuteur afin d’examiner la contribution aux repas de ce semestre et de discuter du solde enregistré.',
    'This notice is based on recorded payments. Please contact the school if a payment is missing or incorrect.': 'Cet avis est basé sur les paiements enregistrés. Contactez l’école si un paiement manque ou est incorrect.',
    'Parent / guardian signature and date': 'Signature du parent/tuteur et date',
    'School representative and date': 'Représentant de l’école et date',
    'Please handle student information confidentially': 'Veuillez protéger la confidentialité des données de l’élève',
    'Supportive parent/guardian meeting list': 'Liste de rencontre avec les parents/tuteurs',
    'Students with a payment above RWF 0 and up to RWF {limit} of their semester fee.': 'Élèves ayant versé plus de 0 RWF et jusqu’à {limit} RWF de leurs frais semestriels.',
    'Please confirm records and invite a parent/guardian to discuss contribution support.': 'Veuillez vérifier les données et inviter le parent/tuteur à discuter de la contribution.',
    'Totals ({count})': 'Totaux ({count})',
    'Verify payment records before follow-up': 'Vérifiez les paiements avant le suivi',
    'Page {page} of {total}': 'Page {page} sur {total}',
    'No semester is set up yet. Add a semester to see insights.': 'Aucun semestre configuré. Ajoutez-en un pour afficher les analyses.',
    'Semester: {semester}': 'Semestre : {semester}',
    'No current-semester payments are recorded for the selected group.': 'Aucun paiement du semestre en cours n’est enregistré pour ce groupe.',
    'This estimate uses the collection pace so far. It will improve when previous semester records are available.': 'Cette estimation repose sur les collectes actuelles. Elle s’améliorera lorsque les données des semestres précédents seront disponibles.',
    'This estimate combines the current collection pace with average collections from previous semesters.': 'Cette estimation combine le rythme actuel des collectes et la moyenne des semestres précédents.',
    'Payment date is missing': 'La date du paiement est manquante',
    'Student record could not be found': 'Le dossier de l’élève est introuvable',
    'Semester record could not be found': 'Le dossier du semestre est introuvable',
    'Possible duplicate: same student, amount, semester, and date': 'Doublon possible : même élève, montant, semestre et date',
    'Student semester total ({paid} RWF) is above the {required} RWF fee': 'Le total versé par l’élève ({paid} RWF) dépasse les frais de {required} RWF',
    'There is not enough matching payment data.': 'Les données de paiement correspondantes sont insuffisantes.',
    'The AI API is not running. Start the app with `vercel dev`; `npm run dev` does not run API functions.': 'L’API IA ne fonctionne pas. Lancez l’application avec `vercel dev` ; `npm run dev` ne lance pas les fonctions API.',
    'The AI API returned an unexpected response. Check that the Vercel API function deployed successfully.': 'L’API IA a renvoyé une réponse inattendue. Vérifiez le déploiement de la fonction API Vercel.',
    'AI is not available now, please try again.': 'L’IA est indisponible. Veuillez réessayer.',
    'Please sign in again to use AI Insights.': 'Reconnectez-vous pour utiliser les analyses IA.',
    'AI is not configured. Add GEMINI_API_KEY to the server environment and redeploy.': 'L’IA n’est pas configurée. Ajoutez GEMINI_API_KEY aux variables serveur et redéployez.',
    'The AI provider rejected its API key. Verify GEMINI_API_KEY and enable the Gemini API for that key.': 'Le fournisseur IA a rejeté la clé API. Vérifiez GEMINI_API_KEY et activez Gemini API pour cette clé.',
    'The AI provider quota was exceeded. Check your Gemini API quota and billing settings.': 'Le quota Gemini API est dépassé. Vérifiez le quota et les paramètres de facturation.',
    'This Gemini API key has no text-generation models available. Enable Gemini API access or check the key’s model availability.': 'Cette clé Gemini API ne dispose d’aucun modèle de génération de texte. Activez Gemini API ou vérifiez les modèles accessibles à cette clé.',
    'Gemini could not find a usable model for this API key. Remove GEMINI_MODEL to use automatic model selection, or set it to a model available to your key, then redeploy.': 'Gemini n’a trouvé aucun modèle utilisable avec cette clé. Supprimez GEMINI_MODEL pour choisir automatiquement un modèle ou indiquez un modèle accessible à la clé, puis redéployez.',
    'Could not load school data. Check the Supabase configuration and try again.': 'Impossible de charger les données scolaires. Vérifiez la configuration Supabase et réessayez.',
    'Could not copy the reminder. Please select and copy it manually.': 'Impossible de copier le rappel. Sélectionnez-le et copiez-le manuellement.',
    'Could not mark this record as checked.': 'Impossible de marquer cet enregistrement comme vérifié.',
  },
};
const translate = (
  language: Language,
  phrase: string,
  values: Record<string, string | number> = {},
) => {
  let result = language === 'English' ? phrase : translations[language][phrase] ?? phrase;
  for (const [key, value] of Object.entries(values)) {
    result = result.replaceAll(`{${key}}`, String(value));
  }
  return result;
};
const translateIssueReason = (reason: string, language: Language) =>
  reason.split('; ').map(item => {
    const excess = item.match(/^Student's semester total \(([\d,]+) RWF\) is above the ([\d,]+) RWF fee$/);
    if (excess) {
      return translate(language, 'Student semester total ({paid} RWF) is above the {required} RWF fee', {
        paid: excess[1],
        required: excess[2],
      });
    }
    return translate(language, item);
  }).join('; ');
const languageLocale: Record<Language, string> = {
  English: 'en-RW',
  Kinyarwanda: 'rw-RW',
  French: 'fr-FR',
};
const riskColor: Record<RiskLevel, string> = {
  Low: 'bg-emerald-100 text-emerald-800',
  Medium: 'bg-amber-100 text-amber-800',
  High: 'bg-red-100 text-red-800',
};

const getApiError = async (response: Response) => {
  const result = await response.json().catch(() => null) as { error?: string } | null;
  return result?.error ?? 'AI is not available now, please try again.';
};

const callAi = async <T,>(payload: Record<string, unknown>): Promise<T> => {
  const { data: { session }, error: sessionError } = await supabase.auth.getSession();
  if (sessionError) throw new Error(sessionError.message);
  if (!session?.access_token) throw new Error('Please sign in again to use AI Insights.');

  const response = await fetch('/api/ai', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${session.access_token}`,
    },
    body: JSON.stringify(payload),
  });
  if (!response.headers.get('content-type')?.includes('application/json')) {
    throw new Error(import.meta.env.DEV
      ? 'The AI API is not running. Start the app with `vercel dev`; `npm run dev` does not run API functions.'
      : 'The AI API returned an unexpected response. Check that the Vercel API function deployed successfully.');
  }
  if (!response.ok) throw new Error(await getApiError(response));
  return response.json() as Promise<T>;
};

const SummarySkeleton = () => (
  <div className="space-y-3 animate-pulse" aria-label="Loading summary">
    <div className="h-4 w-full rounded bg-slate-200" />
    <div className="h-4 w-11/12 rounded bg-slate-200" />
    <div className="h-4 w-4/5 rounded bg-slate-200" />
  </div>
);

export const AIInsights = () => {
  const [language, setLanguage] = useState<Language>('English');
  const t = (phrase: string, values: Record<string, string | number> = {}) =>
    translate(language, phrase, values);
  const [overview, setOverview] = useState<InsightOverview | null>(null);
  const [loading, setLoading] = useState(true);
  const [summaryLoading, setSummaryLoading] = useState(false);
  const [pageError, setPageError] = useState('');
  const [selectedClass, setSelectedClass] = useState('all');
  const [selectedLowPaymentClass, setSelectedLowPaymentClass] = useState('all');
  const [selectedRisk, setSelectedRisk] = useState('all');
  const [reminderTone, setReminderTone] = useState<'Friendly' | 'Formal'>('Friendly');
  const [deadline, setDeadline] = useState('');
  const [reminderStudentId, setReminderStudentId] = useState('');
  const [reminderText, setReminderText] = useState('');
  const [reminderLoading, setReminderLoading] = useState(false);
  const [copiedReminder, setCopiedReminder] = useState(false);
  const [chatQuestion, setChatQuestion] = useState('');
  const [chatReply, setChatReply] = useState<ChatReply | null>(null);
  const [chatLoading, setChatLoading] = useState(false);
  const [chatError, setChatError] = useState('');
  const [checkedIds, setCheckedIds] = useState<string[]>([]);
  const [checkingId, setCheckingId] = useState('');
  const [issueError, setIssueError] = useState('');

  const loadOverview = useCallback(async (nextLanguage: Language, refresh = false) => {
    setPageError('');
    if (refresh) setSummaryLoading(true);
    try {
      const result = await callAi<InsightOverview>({ action: 'overview', language: nextLanguage });
      setOverview(result);
      setDeadline(current => current || result.semester?.end_date || '');
      if (result.error) setPageError(translate(nextLanguage, result.error));
    } catch (error) {
      setPageError(translate(nextLanguage, error instanceof Error ? error.message : 'AI is not available now, please try again.'));
    } finally {
      setLoading(false);
      setSummaryLoading(false);
    }
  }, []);

  const changeLanguage = async (nextLanguage: Language) => {
    setPageError('');
    setLoading(true);
    setLanguage(nextLanguage);
    setChatReply(null);
    setChatError('');
    if (!reminderStudentId || !overview) return;

    setReminderText('');
    setReminderLoading(true);
    try {
      const result = await callAi<{ message: string }>({
        action: 'reminder',
        studentId: reminderStudentId,
        language: nextLanguage,
        tone: reminderTone,
        deadline,
      });
      setReminderText(result.message);
    } catch (error) {
      setPageError(translate(nextLanguage, error instanceof Error ? error.message : 'AI is not available now, please try again.'));
    } finally {
      setReminderLoading(false);
    }
  };

  useEffect(() => {
    void loadOverview(language);
  }, [language, loadOverview]);

  const filteredRisks = useMemo(() =>
    (overview?.risks ?? []).filter(student =>
      (selectedClass === 'all' || student.classId === selectedClass)
      && (selectedRisk === 'all' || student.risk === selectedRisk),
    ), [overview?.risks, selectedClass, selectedRisk]);

  const lowPaymentStudents = useMemo(() =>
    (overview?.lowPaymentStudents ?? []).filter(student =>
      selectedLowPaymentClass === 'all' || student.classId === selectedLowPaymentClass,
    ), [overview?.lowPaymentStudents, selectedLowPaymentClass]);

  const exportStudentFollowUpPdf = (student: LowPaymentStudent) => {
    if (!overview) return;

    const doc = new jsPDF({ unit: 'mm', format: 'a4' });
    const pageWidth = doc.internal.pageSize.getWidth();
    const pageHeight = doc.internal.pageSize.getHeight();
    const generatedDate = new Date().toLocaleDateString(languageLocale[language], {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    });

    doc.setProperties({
      title: `${t('Student Contribution Follow-Up')} - ${student.studentName}`,
      subject: t('Individual student contribution follow-up'),
      creator: 'School Feeding Management System',
    });
    doc.setFillColor(6, 78, 59);
    doc.rect(0, 0, pageWidth, 48, 'F');
    doc.setFillColor(16, 185, 129);
    doc.rect(0, 48, pageWidth, 2, 'F');
    doc.setTextColor(255, 255, 255);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(19);
    doc.text(t('Student Contribution Follow-Up'), 18, 20);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(11);
    doc.text(t('Parent / guardian meeting record'), 18, 30);
    doc.setFontSize(9);
    doc.text(t('Generated {date}', { date: generatedDate }), 18, 39);

    doc.setTextColor(30, 41, 59);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(15);
    doc.text(student.studentName, 18, 69);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(10);
    doc.setTextColor(71, 85, 105);
    doc.text(`${t('Admission no.')}: ${student.admissionNumber}`, 18, 78);
    doc.text(`${t('Class')}: ${student.className}`, 18, 85);
    doc.text(`${t('Semester')}: ${overview.semester.name}`, 18, 92);

    doc.setFillColor(240, 253, 250);
    doc.roundedRect(18, 104, pageWidth - 36, 57, 4, 4, 'F');
    doc.setTextColor(6, 78, 59);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(10);
    doc.text(t('SEMESTER CONTRIBUTION SUMMARY'), 26, 116);

    doc.setDrawColor(204, 251, 241);
    doc.line(26, 122, pageWidth - 26, 122);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(10);
    doc.setTextColor(71, 85, 105);
    doc.text(t('Contribution recorded'), 26, 134);
    doc.text(t('Semester fee'), 91, 134);
    doc.text(t('Balance remaining'), 153, 134);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(13);
    doc.setTextColor(180, 83, 9);
    doc.text(formatCurrency(student.amountPaid), 26, 145);
    doc.setTextColor(30, 41, 59);
    doc.text(formatCurrency(student.amountRequired), 91, 145);
    doc.setTextColor(185, 28, 28);
    doc.text(formatCurrency(student.amountRemaining), 153, 145);

    doc.setTextColor(30, 41, 59);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(12);
    doc.text(t('Meeting request'), 18, 181);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(10);
    doc.setTextColor(71, 85, 105);
    const message = doc.splitTextToSize(
      t('Please visit the school with your parent or guardian to review this semester’s school-feeding contribution and discuss any questions about the recorded balance.'),
      pageWidth - 36,
    );
    doc.text(message, 18, 190, { lineHeightFactor: 1.6 });

    doc.setFillColor(255, 251, 235);
    doc.roundedRect(18, 215, pageWidth - 36, 21, 3, 3, 'F');
    doc.setTextColor(120, 53, 15);
    doc.setFontSize(9);
    doc.text(
      t('This notice is based on recorded payments. Please contact the school if a payment is missing or incorrect.'),
      24,
      228,
    );

    const signatureY = Math.min(258, pageHeight - 33);
    doc.setDrawColor(148, 163, 184);
    doc.line(18, signatureY, 88, signatureY);
    doc.line(119, signatureY, pageWidth - 18, signatureY);
    doc.setTextColor(100, 116, 139);
    doc.setFontSize(8);
    doc.text(t('Parent / guardian signature and date'), 18, signatureY + 6);
    doc.text(t('School representative and date'), 119, signatureY + 6);

    doc.setDrawColor(226, 232, 240);
    doc.line(18, pageHeight - 17, pageWidth - 18, pageHeight - 17);
    doc.setTextColor(100, 116, 139);
    doc.setFontSize(8);
    doc.text(`School Feeding Management System | ${t('Please handle student information confidentially')}`, 18, pageHeight - 11);

    const safeName = student.studentName
      .normalize('NFKD')
      .replace(/[^\w -]/g, '')
      .trim()
      .replace(/\s+/g, '-')
      .toLowerCase() || student.studentId;
    doc.save(`contribution-follow-up-${safeName}-${new Date().toISOString().slice(0, 10)}.pdf`);
  };

  const exportReminderPdf = () => {
    if (!overview || !reminderText || !reminderStudentId) return;
    const student = overview.risks.find(item => item.studentId === reminderStudentId);
    if (!student) return;

    const doc = new jsPDF({ unit: 'mm', format: 'a4' });
    const pageWidth = doc.internal.pageSize.getWidth();
    const pageHeight = doc.internal.pageSize.getHeight();
    const generatedDate = new Date().toLocaleDateString(languageLocale[language], {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    });

    doc.setProperties({
      title: `${t('Payment reminder')} - ${student.studentName}`,
      subject: t('Parent/guardian payment reminder'),
      creator: 'School Feeding Management System',
    });
    doc.setFillColor(30, 58, 138);
    doc.rect(0, 0, pageWidth, 45, 'F');
    doc.setFillColor(99, 102, 241);
    doc.rect(0, 45, pageWidth, 2, 'F');
    doc.setTextColor(255, 255, 255);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(19);
    doc.text(t('Payment reminder'), 18, 20);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(10);
    doc.text(`${student.studentName} · ${student.className}`, 18, 30);
    doc.text(t('Generated {date}', { date: generatedDate }), 18, 38);

    doc.setTextColor(30, 41, 59);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(11);
    doc.text(t('Semester: {semester}', { semester: overview.semester.name }), 18, 62);
    doc.text(t('Amount remaining: {amount}', { amount: formatCurrency(student.amountRemaining) }), 18, 71);
    doc.text(t('Please review this reminder before sending.'), 18, 80);

    doc.setFillColor(248, 250, 252);
    doc.setDrawColor(226, 232, 240);
    doc.roundedRect(18, 91, pageWidth - 36, 112, 4, 4, 'FD');
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(12);
    doc.setTextColor(51, 65, 85);
    const reminderLines = doc.splitTextToSize(reminderText, pageWidth - 52);
    doc.text(reminderLines, 26, 104, { lineHeightFactor: 1.65 });

    doc.setFontSize(9);
    doc.setTextColor(100, 116, 139);
    const footer = doc.splitTextToSize(
      t('This is a draft only. A teacher must review it and deliver it to the parent/guardian.'),
      pageWidth - 36,
    );
    doc.text(footer, 18, 218);
    doc.setDrawColor(226, 232, 240);
    doc.line(18, pageHeight - 17, pageWidth - 18, pageHeight - 17);
    doc.setFontSize(8);
    doc.text(t('Please handle student information confidentially'), 18, pageHeight - 11);

    const safeName = student.studentName
      .normalize('NFKD')
      .replace(/[^\w -]/g, '')
      .trim()
      .replace(/\s+/g, '-')
      .toLowerCase() || student.studentId;
    doc.save(`payment-reminder-${safeName}-${new Date().toISOString().slice(0, 10)}.pdf`);
  };

  const exportLowPaymentPdf = () => {
    if (!overview || lowPaymentStudents.length === 0) return;

    const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
    const pageWidth = doc.internal.pageSize.getWidth();
    const pageHeight = doc.internal.pageSize.getHeight();
    const generatedDate = new Date().toLocaleDateString(languageLocale[language], {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    });
    const className = selectedLowPaymentClass === 'all'
      ? t('All classes')
      : overview.classes.find(item => item.id === selectedLowPaymentClass)?.name ?? 'Selected class';
    const totalPaid = lowPaymentStudents.reduce((total, student) => total + student.amountPaid, 0);
    const totalRemaining = lowPaymentStudents.reduce((total, student) => total + student.amountRemaining, 0);

    doc.setProperties({
      title: `${t('Low Payment Follow-Up')} - ${overview.semester.name}`,
      subject: t('Student contribution follow-up list'),
      creator: 'School Feeding Management System',
    });
    doc.setFillColor(6, 78, 59);
    doc.rect(0, 0, pageWidth, 34, 'F');
    doc.setFillColor(16, 185, 129);
    doc.rect(0, 34, pageWidth, 2, 'F');
    doc.setTextColor(255, 255, 255);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(18);
    doc.text(t('Student Contribution Follow-Up'), 14, 14);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(10);
    doc.text(t('Supportive parent/guardian meeting list'), 14, 23);
    doc.setFontSize(9);
    doc.text(t('Generated {date}', { date: generatedDate }), pageWidth - 14, 23, { align: 'right' });

    doc.setTextColor(30, 41, 59);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(11);
    doc.text(`${t('Semester')}: ${overview.semester.name}`, 14, 47);
    doc.text(`${t('Class')}: ${className}`, pageWidth / 2, 47);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9);
    doc.setTextColor(71, 85, 105);
    doc.text(
      t('Students with a payment above RWF 0 and up to RWF {limit} of their semester fee.', { limit: overview.lowPaymentLimit.toLocaleString(languageLocale[language]) }),
      14,
      54,
    );
    doc.text(
      t('Please confirm records and invite a parent/guardian to discuss contribution support.'),
      14,
      60,
    );

    autoTable(doc, {
      startY: 68,
      head: [['#', t('Student'), t('Admission no.'), t('Class'), t('Paid'), t('Semester fee'), t('Balance'), t('Paid %')]],
      body: lowPaymentStudents.map((student, index) => [
        String(index + 1),
        student.studentName,
        student.admissionNumber,
        student.className,
        formatCurrency(student.amountPaid),
        formatCurrency(student.amountRequired),
        formatCurrency(student.amountRemaining),
        `${student.percentagePaid.toFixed(1)}%`,
      ]),
      theme: 'striped',
      headStyles: { fillColor: [6, 78, 59], textColor: 255, fontStyle: 'bold', fontSize: 9 },
      foot: [[
        '',
        '',
        '',
        t('Totals ({count})', { count: lowPaymentStudents.length }),
        formatCurrency(totalPaid),
        '',
        formatCurrency(totalRemaining),
        '',
      ]],
      showFoot: 'lastPage',
      footStyles: { fillColor: [236, 253, 245], textColor: [6, 78, 59], fontStyle: 'bold', fontSize: 9 },
      alternateRowStyles: { fillColor: [240, 253, 250] },
      bodyStyles: { textColor: [51, 65, 85], fontSize: 8.5, cellPadding: 3.2 },
      columnStyles: {
        0: { halign: 'center', cellWidth: 10 },
        4: { halign: 'right' },
        5: { halign: 'right' },
        6: { halign: 'right', fontStyle: 'bold', textColor: [185, 28, 28] },
        7: { halign: 'right' },
      },
      margin: { left: 14, right: 14 },
    });

    const pageCount = doc.getNumberOfPages();
    for (let page = 1; page <= pageCount; page += 1) {
      doc.setPage(page);
      doc.setDrawColor(226, 232, 240);
      doc.line(14, pageHeight - 12, pageWidth - 14, pageHeight - 12);
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(8);
      doc.setTextColor(100, 116, 139);
      doc.text(`School Feeding Management System | ${t('Verify payment records before follow-up')}`, 14, pageHeight - 7);
      doc.text(`Page ${page} of ${pageCount}`, pageWidth - 14, pageHeight - 7, { align: 'right' });
    }

    doc.save(`low-payment-follow-up-${new Date().toISOString().slice(0, 10)}.pdf`);
  };

  const writeReminder = async (student: RiskStudent) => {
    setReminderStudentId(student.studentId);
    setReminderText('');
    setCopiedReminder(false);
    setReminderLoading(true);
    setPageError('');
    try {
      const result = await callAi<{ message: string }>({
        action: 'reminder',
        studentId: student.studentId,
        language,
        tone: reminderTone,
        deadline,
      });
      setReminderText(result.message);
    } catch (error) {
      setPageError(translate(language, error instanceof Error ? error.message : 'AI is not available now, please try again.'));
    } finally {
      setReminderLoading(false);
    }
  };

  const copyReminder = async () => {
    try {
      await navigator.clipboard.writeText(reminderText);
      setCopiedReminder(true);
    } catch {
      setPageError(t('Could not copy the reminder. Please select and copy it manually.'));
    }
  };

  const askQuestion = async (event: FormEvent) => {
    event.preventDefault();
    if (!chatQuestion.trim()) return;
    setChatLoading(true);
    setChatError('');
    setChatReply(null);
    try {
      const result = await callAi<ChatReply>({
        action: 'chat',
        question: chatQuestion.trim(),
        language,
      });
      setChatReply(result);
    } catch (error) {
      setChatError(translate(language, error instanceof Error ? error.message : 'AI is not available now, please try again.'));
    } finally {
      setChatLoading(false);
    }
  };

  const markChecked = async (issueId: string) => {
    setCheckingId(issueId);
    setIssueError('');
    try {
      await callAi<{ ok: boolean }>({ action: 'mark_checked', paymentId: issueId });
      setCheckedIds(ids => [...ids, issueId]);
    } catch (error) {
      setIssueError(translate(language, error instanceof Error ? error.message : 'Could not mark this record as checked.'));
    } finally {
      setCheckingId('');
    }
  };

  const issues = (overview?.issues ?? []).map(issue =>
    checkedIds.includes(issue.id) ? { ...issue, checked: true } : issue,
  );
  const openIssues = issues.filter(issue => !issue.checked);
  const maxChartValue = Math.max(overview?.prediction.expected ?? 0, overview?.prediction.predicted ?? 0, 1);
  const hasStudents = Boolean(overview?.risks.length || overview?.classes.length);

  return (
    <div className="mx-auto max-w-7xl space-y-6">
      <header className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <div className="mb-2 inline-flex items-center gap-2 rounded-full bg-indigo-50 px-3 py-1 text-xs font-semibold text-indigo-700">
            <Sparkles className="h-3.5 w-3.5" /> {t('Helpful school data, made clearer')}
          </div>
          <h1 className="text-2xl font-bold text-slate-900 sm:text-3xl">{t('AI Insights')}</h1>
          <p className="mt-1 text-sm text-slate-500">
            {overview?.semester?.name
              ? t('Current semester: {semester}', { semester: overview.semester.name })
              : t('Understand payments and spot what needs attention.')}
          </p>
        </div>
        <label className="flex items-center gap-2 text-sm font-medium text-slate-600">
          {t('Language')}
          <select
            value={language}
            onChange={event => { void changeLanguage(event.target.value as Language); }}
            className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-800 focus:border-primary-600 focus:outline-none focus:ring-2 focus:ring-primary-100"
          >
            {languages.map(item => <option key={item}>{item}</option>)}
          </select>
        </label>
      </header>

      <div role="note" className="flex items-center gap-2 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
        <AlertCircle className="h-4 w-4 shrink-0" />
        {t('AI gives suggestions. Please check before you act.')}
      </div>

      {pageError && (
        <div role="alert" className="flex items-start justify-between gap-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
          <span>{pageError}</span>
          <button onClick={() => void loadOverview(language, true)} className="shrink-0 font-semibold underline">{t('Try again')}</button>
        </div>
      )}

      {loading ? (
        <div className="rounded-2xl border border-slate-200 bg-white p-6 text-sm text-slate-500">{t('Loading school insights…')}</div>
      ) : overview?.empty ? (
        <div className="rounded-2xl border border-slate-200 bg-white p-10 text-center">
          <Bot className="mx-auto h-10 w-10 text-slate-300" />
          <h2 className="mt-3 text-lg font-semibold text-slate-800">{t('No semester yet')}</h2>
          <p className="mt-1 text-sm text-slate-500">{overview.error ? t(overview.error) : t('No semester is set up yet. Add a semester to see insights.')}</p>
        </div>
      ) : !hasStudents ? (
        <div className="rounded-2xl border border-slate-200 bg-white p-10 text-center">
          <Bot className="mx-auto h-10 w-10 text-slate-300" />
          <h2 className="mt-3 text-lg font-semibold text-slate-800">{t('No students yet')}</h2>
          <p className="mt-1 text-sm text-slate-500">{t('Add students to see insights.')}</p>
        </div>
      ) : overview && (
        <>
          <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <h2 className="flex items-center gap-2 text-lg font-bold text-slate-800">
                  <Sparkles className="h-5 w-5 text-indigo-600" /> {t('AI summary')}
                </h2>
                <p className="mt-1 text-xs text-slate-500">{t('A simple snapshot of the current semester.')}</p>
              </div>
              <button
                onClick={() => {
                  setPageError('');
                  void loadOverview(language, true);
                }}
                disabled={summaryLoading}
                className="inline-flex items-center justify-center gap-2 self-start rounded-lg border border-slate-200 px-3 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-50 disabled:opacity-60"
              >
                <RefreshCw className={`h-4 w-4 ${summaryLoading ? 'animate-spin' : ''}`} />
                {t('Refresh summary')}
              </button>
            </div>
            <div className="mt-5 min-h-16 rounded-xl bg-indigo-50/70 p-4 text-sm leading-7 text-slate-700">
              {summaryLoading ? <SummarySkeleton /> : overview.summary
                ?? t('AI summary is unavailable. Check the setup message above, then try again.')}
            </div>
            <div className="mt-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
              {[
                [t('Total collected'), overview.collected],
                [t('Total unpaid'), overview.unpaid],
                [t('Collection progress'), overview.percentageCollected, true],
                [t('Students at risk'), overview.risks.length],
              ].map(([label, value, percent]) => (
                <div key={String(label)} className="rounded-xl border border-slate-100 bg-slate-50 p-3">
                  <p className="text-xs text-slate-500">{label}</p>
                  <p className="mt-1 text-base font-bold text-slate-800">
                    {percent ? `${Number(value).toFixed(1)}%` : label === t('Students at risk') ? value : formatCurrency(Number(value))}
                  </p>
                </div>
              ))}
            </div>
          </section>

          <section aria-labelledby="low-payment-title" className="overflow-hidden rounded-2xl border border-emerald-200 bg-white shadow-sm">
            <div className="border-b border-emerald-100 bg-gradient-to-r from-emerald-50 via-white to-amber-50 p-5 sm:p-6">
              <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
                <div>
                  <div className="mb-2 inline-flex items-center gap-2 rounded-full bg-white px-3 py-1 text-xs font-semibold text-emerald-800 shadow-sm">
                    <AlertCircle className="h-3.5 w-3.5" />
                    {t('Payment follow-up')}
                  </div>
                  <h2 id="low-payment-title" className="text-lg font-bold text-slate-900">
                    {t('Parent/guardian follow-up list')}
                  </h2>
                  <p className="mt-1 max-w-2xl text-sm leading-6 text-slate-600">
                    {t('Students who have paid more than RWF 0 and no more than {amount} toward their current-semester fee, based on recorded payments.', {
                      amount: formatCurrency(overview.lowPaymentLimit),
                    })}
                  </p>
                </div>
                <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
                  <label className="text-xs font-medium text-slate-500">
                    {t('Filter by class')}
                    <select
                      value={selectedLowPaymentClass}
                      onChange={event => setSelectedLowPaymentClass(event.target.value)}
                      className="mt-1 block w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-800"
                    >
                      <option value="all">{t('All classes')}</option>
                      {overview.classes.map(schoolClass => (
                        <option key={schoolClass.id} value={schoolClass.id}>{schoolClass.name}</option>
                      ))}
                    </select>
                  </label>
                  <button
                    type="button"
                    onClick={exportLowPaymentPdf}
                    disabled={lowPaymentStudents.length === 0}
                    className="inline-flex items-center justify-center gap-2 rounded-lg bg-emerald-800 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-emerald-900 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    <FileDown className="h-4 w-4" />
                    {t('Download / print PDF')}
                  </button>
                </div>
              </div>
            </div>

            {lowPaymentStudents.length === 0 ? (
              <div className="p-8 text-center">
                <CheckCircle2 className="mx-auto h-8 w-8 text-emerald-600" />
                <p className="mt-2 text-sm font-semibold text-slate-800">{t('No students match this payment range.')}</p>
                <p className="mt-1 text-xs text-slate-500">
                  {t('Students with no recorded payments are shown in the early-warning list instead.')}
                </p>
              </div>
            ) : (
              <>
                <div className="flex flex-wrap items-center justify-between gap-2 px-5 pt-4 text-sm">
                  <span className="font-semibold text-slate-800">
                    {t('{count} student(s) to follow up', { count: lowPaymentStudents.length })}
                  </span>
                  <span className="text-xs text-slate-500">
                    {t('{semester} · verify records before contacting families', { semester: overview.semester.name })}
                  </span>
                </div>
                <div className="overflow-x-auto p-5 pt-3">
                  <table className="w-full min-w-[850px] text-left text-sm">
                    <thead className="border-b border-slate-200 text-xs uppercase tracking-wide text-slate-500">
                      <tr>
                        <th className="px-3 py-3 font-semibold">{t('Student')}</th>
                        <th className="px-3 py-3 font-semibold">{t('Admission no.')}</th>
                        <th className="px-3 py-3 font-semibold">{t('Class')}</th>
                        <th className="px-3 py-3 text-right font-semibold">{t('Paid')}</th>
                        <th className="px-3 py-3 text-right font-semibold">{t('Fee')}</th>
                        <th className="px-3 py-3 text-right font-semibold">{t('Balance')}</th>
                        <th className="px-3 py-3 text-right font-semibold">{t('Progress')}</th>
                        <th className="px-3 py-3 text-right font-semibold">{t('Individual PDF')}</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {lowPaymentStudents.map(student => (
                        <tr key={student.studentId} className="transition hover:bg-emerald-50/50">
                          <td className="px-3 py-3 font-semibold text-slate-800">{student.studentName}</td>
                          <td className="px-3 py-3 text-slate-600">{student.admissionNumber}</td>
                          <td className="px-3 py-3 text-slate-600">{student.className}</td>
                          <td className="px-3 py-3 text-right tabular-nums font-semibold text-amber-700">{formatCurrency(student.amountPaid)}</td>
                          <td className="px-3 py-3 text-right tabular-nums text-slate-600">{formatCurrency(student.amountRequired)}</td>
                          <td className="px-3 py-3 text-right tabular-nums font-semibold text-red-700">{formatCurrency(student.amountRemaining)}</td>
                          <td className="px-3 py-3 text-right tabular-nums text-slate-600">{student.percentagePaid.toFixed(1)}%</td>
                          <td className="px-3 py-3 text-right">
                            <button
                              type="button"
                              onClick={() => exportStudentFollowUpPdf(student)}
                              aria-label={t('Download individual follow-up PDF for {name}', { name: student.studentName })}
                              className="inline-flex items-center gap-1.5 whitespace-nowrap rounded-lg border border-emerald-200 bg-white px-2.5 py-1.5 text-xs font-semibold text-emerald-800 transition hover:bg-emerald-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-700"
                            >
                              <FileDown className="h-3.5 w-3.5" />
                              {t('Student PDF')}
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <p className="border-t border-slate-100 bg-slate-50 px-5 py-3 text-xs leading-5 text-slate-500">
                  {t('This is a payment-record follow-up aid, not a disciplinary list. Please confirm each record and speak with families respectfully.')}
                </p>
              </>
            )}
          </section>

          <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
            <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
              <div>
                <h2 className="text-lg font-bold text-slate-800">{t('Early warning for late payers')}</h2>
                <p className="mt-1 text-sm text-slate-500">{t('A guide based on this semester’s payments and past semester records.')}</p>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <label className="text-xs font-medium text-slate-500">
                  {t('Class')}
                  <select value={selectedClass} onChange={event => setSelectedClass(event.target.value)} className="mt-1 block w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-800">
                    <option value="all">{t('All classes')}</option>
                    {overview.classes.map(schoolClass => <option key={schoolClass.id} value={schoolClass.id}>{schoolClass.name}</option>)}
                  </select>
                </label>
                <label className="text-xs font-medium text-slate-500">
                  {t('Risk level')}
                  <select value={selectedRisk} onChange={event => setSelectedRisk(event.target.value)} className="mt-1 block w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-800">
                    <option value="all">{t('All levels')}</option>
                    <option value="High">{t('High')}</option><option value="Medium">{t('Medium')}</option><option value="Low">{t('Low')}</option>
                  </select>
                </label>
              </div>
            </div>

            {filteredRisks.length === 0 ? (
              <div className="mt-5 rounded-xl bg-emerald-50 p-5 text-center text-sm text-emerald-800">
                {t('No students match these filters. There are no payment warnings to show.')}
              </div>
            ) : (
              <div className="mt-5 overflow-x-auto">
                <table className="w-full min-w-[720px] text-left text-sm">
                  <thead className="border-b border-slate-200 text-xs uppercase tracking-wide text-slate-500">
                    <tr>
                      <th className="px-3 py-3 font-semibold">{t('Student')}</th>
                      <th className="px-3 py-3 font-semibold">{t('Class')}</th>
                      <th className="px-3 py-3 text-right font-semibold">{t('Paid')}</th>
                      <th className="px-3 py-3 text-right font-semibold">{t('Remaining')}</th>
                      <th className="px-3 py-3 font-semibold">{t('Risk')}</th>
                      <th className="px-3 py-3 font-semibold">{t('Reminder')}</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {filteredRisks.map(student => (
                      <tr key={student.studentId} className="hover:bg-slate-50">
                        <td className="px-3 py-3 font-medium text-slate-800">{student.studentName}</td>
                        <td className="px-3 py-3 text-slate-600">{student.className}</td>
                        <td className="px-3 py-3 text-right tabular-nums text-slate-600">{formatCurrency(student.amountPaid)}</td>
                        <td className="px-3 py-3 text-right tabular-nums font-semibold text-slate-800">{formatCurrency(student.amountRemaining)}</td>
                        <td className="px-3 py-3"><span className={`rounded-full px-2.5 py-1 text-xs font-bold ${riskColor[student.risk]}`}>{t(student.risk)}</span></td>
                        <td className="px-3 py-3">
                          <button
                            onClick={() => void writeReminder(student)}
                            disabled={reminderLoading}
                            className="rounded-lg bg-primary-700 px-3 py-2 text-xs font-semibold text-white hover:bg-primary-800 disabled:opacity-60"
                          >
                            {t('Write reminder')}
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            <div className="mt-4 grid gap-3 sm:grid-cols-[1fr_auto_auto] sm:items-end">
              <label className="text-xs font-medium text-slate-500">
                {t('Reminder deadline')}
                <input type="date" value={deadline} onChange={event => setDeadline(event.target.value)} className="mt-1 block w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-700" />
                <span className="mt-1 block font-normal">{t('Default is the semester end date. Adjust to your school’s deadline.')}</span>
              </label>
              <label className="text-xs font-medium text-slate-500">
                {t('Message tone')}
                <select value={reminderTone} onChange={event => setReminderTone(event.target.value as 'Friendly' | 'Formal')} className="mt-1 block w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-800">
                  <option value="Friendly">{t('Friendly')}</option><option value="Formal">{t('Formal')}</option>
                </select>
              </label>
              <p className="pb-2 text-xs text-slate-500">{t('Messages are drafts only. A teacher must review and send them.')}</p>
            </div>

            {reminderStudentId && (
              <div className="mt-4 rounded-xl border border-primary-100 bg-primary-50/50 p-4">
                <div className="mb-2 flex items-center justify-between gap-2">
                  <h3 className="text-sm font-bold text-slate-800">{t('Reminder draft')}</h3>
                  <button onClick={() => { setReminderStudentId(''); setReminderText(''); }} className="text-xs font-semibold text-slate-500 hover:text-slate-800">{t('Close')}</button>
                </div>
                {reminderLoading ? (
                  <p className="text-sm text-slate-500">{t('Writing a polite reminder…')}</p>
                ) : (
                  <>
                    <textarea
                      value={reminderText}
                      onChange={event => { setReminderText(event.target.value); setCopiedReminder(false); }}
                      rows={5}
                      aria-label={t('Edit reminder message')}
                      className="w-full rounded-lg border border-slate-200 bg-white p-3 text-sm leading-6 text-slate-700 focus:border-primary-600 focus:outline-none focus:ring-2 focus:ring-primary-100"
                    />
                    <button onClick={() => void copyReminder()} disabled={!reminderText} className="mt-2 inline-flex items-center gap-2 rounded-lg bg-primary-700 px-4 py-2 text-sm font-semibold text-white hover:bg-primary-800 disabled:opacity-50">
                      {copiedReminder ? <Check className="h-4 w-4" /> : <Clipboard className="h-4 w-4" />}
                      {copiedReminder ? t('Copied') : t('Copy')}
                    </button>
                    <button
                      type="button"
                      onClick={exportReminderPdf}
                      disabled={!reminderText}
                      className="mt-2 ml-2 inline-flex items-center gap-2 rounded-lg border border-primary-200 bg-white px-4 py-2 text-sm font-semibold text-primary-800 hover:bg-primary-50 disabled:opacity-50"
                    >
                      <FileDown className="h-4 w-4" />
                      {t('Download reminder as PDF')}
                    </button>
                  </>
                )}
              </div>
            )}
          </section>

          <section className="grid gap-6 xl:grid-cols-2">
            <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
              <h2 className="flex items-center gap-2 text-lg font-bold text-slate-800"><Bot className="h-5 w-5 text-indigo-600" /> {t('Ask in normal words')}</h2>
              <p className="mt-1 text-sm text-slate-500">{t('Ask about this semester’s payment records.')}</p>
              <form onSubmit={event => void askQuestion(event)} className="mt-4 flex flex-col gap-2 sm:flex-row">
                <input
                  value={chatQuestion}
                  onChange={event => setChatQuestion(event.target.value)}
                  maxLength={500}
                  placeholder={t('Who has paid? Who has not paid in Senior 3?')}
                  className="min-w-0 flex-1 rounded-lg border border-slate-300 px-3 py-2.5 text-sm focus:border-primary-600 focus:outline-none focus:ring-2 focus:ring-primary-100"
                />
                <button disabled={chatLoading || !chatQuestion.trim()} className="inline-flex items-center justify-center gap-2 rounded-lg bg-primary-700 px-4 py-2.5 text-sm font-semibold text-white hover:bg-primary-800 disabled:opacity-50">
                  <Send className="h-4 w-4" /> {t('Ask')}
                </button>
              </form>
              {chatLoading && <p className="mt-4 text-sm text-slate-500">{t('Checking the payment records…')}</p>}
              {chatError && <p role="alert" className="mt-4 text-sm text-red-700">{chatError}</p>}
              {chatReply && (
                <div className="mt-4 rounded-xl bg-slate-50 p-4">
                  <p className="text-sm font-medium leading-6 text-slate-800">{chatReply.answer}</p>
                  {chatReply.rows.length > 0 && (
                    <div className="mt-3 overflow-x-auto">
                      <table className="w-full min-w-[420px] text-left text-xs">
                        <thead className="text-slate-500"><tr><th className="py-2">{t('Student')}</th><th>{t('Class')}</th><th className="text-right">{t('Paid')}</th><th className="text-right">{t('Remaining')}</th></tr></thead>
                        <tbody className="divide-y divide-slate-200">
                          {chatReply.rows.map((row, index) => (
                            <tr key={`${row.student}-${index}`}><td className="py-2 font-medium">{row.student}</td><td>{row.class}</td><td className="text-right">{formatCurrency(row.amountPaid)}</td><td className="text-right">{formatCurrency(row.amountRemaining)}</td></tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              )}
            </div>

            <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <h2 className="text-lg font-bold text-slate-800">{t('Semester prediction')}</h2>
                  <p className="mt-1 text-xs font-semibold uppercase tracking-wide text-amber-700">{t('Estimate, not a fact')}</p>
                </div>
                <span className="rounded-full bg-amber-50 p-2 text-amber-700"><Sparkles className="h-5 w-5" /></span>
              </div>
              <div className="mt-5 space-y-4">
                {[
                  [t('Collected so far'), overview.prediction.collected, 'bg-primary-600'],
                  [t('Estimated total'), overview.prediction.predicted, 'bg-amber-500'],
                ].map(([label, value, color]) => (
                  <div key={String(label)}>
                    <div className="mb-1 flex justify-between gap-3 text-xs">
                      <span className="font-medium text-slate-600">{label}</span>
                      <span className="font-bold text-slate-800">{formatCurrency(Number(value))}</span>
                    </div>
                    <div className="h-3 overflow-hidden rounded-full bg-slate-100">
                      <div className={`h-full rounded-full ${color}`} style={{ width: `${Math.min(100, Number(value) / maxChartValue * 100)}%` }} />
                    </div>
                  </div>
                ))}
              </div>
              <p className="mt-4 text-sm leading-6 text-slate-600">{t(overview.prediction.explanation)}</p>
              <p className="mt-2 text-xs text-slate-400">
                {overview.prediction.historicalSemesters
                  ? t('Compared with {count} previous semester(s).', { count: overview.prediction.historicalSemesters })
                  : t('No completed previous semesters were found.')}
              </p>
            </div>
          </section>

          <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
            <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
              <div>
                <h2 className="flex items-center gap-2 text-lg font-bold text-slate-800"><AlertCircle className="h-5 w-5 text-amber-600" /> {t('Mistake checker')}</h2>
                <p className="mt-1 text-sm text-slate-500">{t('Possible issues to review. Nothing is changed or deleted automatically.')}</p>
              </div>
              <span className="text-sm font-semibold text-slate-500">{t('{count} record(s) to check', { count: openIssues.length })}</span>
            </div>
            {issueError && <p role="alert" className="mt-3 text-sm text-red-700">{issueError}</p>}
            {issues.length === 0 ? (
              <div className="mt-5 rounded-xl bg-emerald-50 p-5 text-center text-sm text-emerald-800">
                <CheckCircle2 className="mx-auto mb-2 h-5 w-5" />
                {t('No possible payment mistakes were found.')}
              </div>
            ) : (
              <div className="mt-5 overflow-x-auto">
                <table className="w-full min-w-[760px] text-left text-sm">
                  <thead className="border-b border-slate-200 text-xs uppercase tracking-wide text-slate-500">
                    <tr><th className="px-3 py-3">{t('Student')}</th><th className="px-3 py-3">{t('Class')}</th><th className="px-3 py-3 text-right">{t('Amount')}</th><th className="px-3 py-3">{t('Date')}</th><th className="px-3 py-3">{t('Possible issue')}</th><th className="px-3 py-3">{t('Review')}</th></tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {issues.map(issue => (
                      <tr key={issue.id} className={issue.checked ? 'bg-slate-50 text-slate-500' : ''}>
                        <td className="px-3 py-3 font-medium">{issue.studentName}</td>
                        <td className="px-3 py-3">{issue.className}</td>
                        <td className="px-3 py-3 text-right">{formatCurrency(issue.amount)}</td>
                        <td className="px-3 py-3">{issue.paidAt ? new Date(issue.paidAt).toLocaleDateString(languageLocale[language]) : t('Missing')}</td>
                        <td className="max-w-sm px-3 py-3">{translateIssueReason(issue.reason, language)}</td>
                        <td className="px-3 py-3">
                          {issue.checked ? (
                            <span className="inline-flex items-center gap-1 text-xs font-semibold text-emerald-700"><CheckCircle2 className="h-4 w-4" /> {t('Checked')}</span>
                          ) : (
                            <button onClick={() => void markChecked(issue.id)} disabled={checkingId === issue.id} className="whitespace-nowrap rounded-lg border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50">
                              {checkingId === issue.id ? t('Saving…') : t('Mark as checked')}
                            </button>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        </>
      )}
    </div>
  );
};
