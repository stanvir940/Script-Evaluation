import bcrypt from 'bcryptjs';
import dotenv from 'dotenv';
import { connectDatabase, disconnectDatabase } from '../lib/db';
import {
  User,
  Subject,
  ExamCycle,
  QuestionPaper,
  Script,
  Answer,
  Assignment,
} from '../models';

dotenv.config();

const SAMPLE_QUESTIONS = [
  {
    questionNumber: 1,
    text: 'A body of mass 2 kg moves on a frictionless horizontal surface. If a force of 10 N is applied for 5 seconds, calculate the final velocity.',
    maxMarks: 10,
    rubric: '• Correct formula (F=ma): 2 marks\n• Substitution: 3 marks\n• Final answer with unit: 3 marks\n• Working shown clearly: 2 marks',
    modelAnswer: 'a = F/m = 10/2 = 5 m/s²\nv = u + at = 0 + 5×5 = 25 m/s',
  },
  {
    questionNumber: 2,
    text: 'Define Newton\'s Third Law of Motion and give one practical example.',
    maxMarks: 8,
    rubric: '• Correct definition: 4 marks\n• Valid example: 2 marks\n• Clear explanation: 2 marks',
    modelAnswer: 'For every action, there is an equal and opposite reaction. Example: When we walk, we push the ground backward and the ground pushes us forward.',
  },
  {
    questionNumber: 3,
    text: 'A car travels 120 km in 2 hours. Calculate its average speed in m/s.',
    maxMarks: 6,
    rubric: '• Speed formula: 2 marks\n• Unit conversion: 2 marks\n• Correct answer: 2 marks',
    modelAnswer: 'Speed = 120/2 = 60 km/h = 60 × (1000/3600) = 16.67 m/s',
  },
];

async function seed() {
  await connectDatabase();

  console.log('Clearing existing data...');
  await Promise.all([
    User.deleteMany({}),
    Subject.deleteMany({}),
    ExamCycle.deleteMany({}),
    QuestionPaper.deleteMany({}),
    Script.deleteMany({}),
    Answer.deleteMany({}),
    Assignment.deleteMany({}),
  ]);

  const passwordHash = await bcrypt.hash('password123', 12);

  console.log('Creating subjects...');
  const subjects = await Subject.insertMany([
    { code: 'PHY', name: 'Physics' },
    { code: 'CHE', name: 'Chemistry' },
    { code: 'MAT', name: 'Mathematics' },
    { code: 'ENG', name: 'English' },
  ]);

  const physics = subjects.find((s) => s.code === 'PHY')!;

  console.log('Creating users...');
  const [admin, headExaminer, teacher1, teacher2, teacher3] = await User.insertMany([
    {
      employeeId: 'ADMIN001',
      name: 'System Administrator',
      passwordHash,
      role: 'SUPER_ADMIN',
      subjects: [],
    },
    {
      employeeId: 'HEAD001',
      name: 'Prof. Dr. Karim',
      passwordHash,
      role: 'HEAD_EXAMINER',
      subjects: [],
    },
    {
      employeeId: 'TCH001',
      name: 'Dr. Rahman',
      passwordHash,
      role: 'TEACHER',
      subjects: [physics._id],
    },
    {
      employeeId: 'TCH002',
      name: 'Dr. Ahmed',
      passwordHash,
      role: 'TEACHER',
      subjects: [physics._id],
    },
    {
      employeeId: 'TCH003',
      name: 'Dr. Khan',
      passwordHash,
      role: 'TEACHER',
      subjects: [physics._id],
    },
  ]);

  console.log('Creating exam cycle...');
  const examCycle = await ExamCycle.create({
    name: 'Admission Test 2026',
    year: 2026,
    status: 'ACTIVE',
    escalationThreshold: 3,
    createdBy: admin._id,
  });

  console.log('Creating question paper...');
  const questionPaper = await QuestionPaper.create({
    examCycleId: examCycle._id,
    subjectId: physics._id,
    version: 1,
    questions: SAMPLE_QUESTIONS,
    totalMarks: SAMPLE_QUESTIONS.reduce((sum, q) => sum + q.maxMarks, 0),
    publishedAt: new Date(),
  });

  console.log('Creating scripts and answers...');
  const teachers = [teacher1, teacher2, teacher3];
  const scriptCount = 15;

  for (let i = 1; i <= scriptCount; i++) {
    const script = await Script.create({
      examCycleId: examCycle._id,
      rollNumber: `2026-${String(i).padStart(4, '0')}`,
      candidateId: `A-${4820 + i}`,
      processingStatus: 'READY',
      pageCount: 3,
    });

    for (const question of SAMPLE_QUESTIONS) {
      const answer = await Answer.create({
        examCycleId: examCycle._id,
        scriptId: script._id,
        subjectId: physics._id,
        questionPaperId: questionPaper._id,
        questionNumber: question.questionNumber,
        maxMarks: question.maxMarks,
        answerImageKey: `placeholder/Q${question.questionNumber}-Script-${script.candidateId}`,
        pageNumber: question.questionNumber,
        status: 'ASSIGNED',
        evaluationCount: 0,
      });

      for (let slot = 1; slot <= 3; slot++) {
        const teacher = teachers[slot - 1];
        await Assignment.create({
          examCycleId: examCycle._id,
          answerId: answer._id,
          teacherId: teacher._id,
          slot,
          status: 'PENDING',
        });
      }
    }
  }

  console.log('\nSeed completed successfully!\n');
  console.log('Login credentials (password: password123):');
  console.log('  Super Admin:     ADMIN001');
  console.log('  Head Examiner:   HEAD001');
  console.log('  Teacher (Phy):   TCH001, TCH002, TCH003');
  console.log(`\nCreated ${scriptCount} scripts with ${scriptCount * SAMPLE_QUESTIONS.length} answers`);
  console.log(`Each answer assigned to 3 teachers (${scriptCount * SAMPLE_QUESTIONS.length * 3} assignments for TCH001)`);

  await disconnectDatabase();
}

seed().catch((err) => {
  console.error('Seed failed:', err);
  process.exit(1);
});
