interface Props {
  questionNumber: number;
  subject: { code: string; name: string };
  maxMarks: number;
  questionText: string;
  rubric: string;
  modelAnswer: string;
}

export function QuestionPanel({
  questionNumber,
  subject,
  maxMarks,
  questionText,
  rubric,
  modelAnswer,
}: Props) {
  return (
    <div className="h-full overflow-y-auto bg-white border-r border-border p-4 w-full md:w-[380px] shrink-0">
      <div className="mb-6 pb-4 border-b border-border">
        <h2 className="text-xl font-semibold text-text-primary">Q{questionNumber}</h2>
        <p className="text-base text-text-secondary mt-1">{subject.name}</p>
        <p className="text-sm text-text-muted mt-1">Max marks: {maxMarks}</p>
      </div>

      <section className="mb-6">
        <h3 className="text-lg font-semibold text-text-primary mb-2">Question</h3>
        <p className="text-md text-text-primary leading-relaxed whitespace-pre-wrap">{questionText}</p>
      </section>

      <section className="mb-6">
        <h3 className="text-lg font-semibold text-text-primary mb-2">Rubric</h3>
        <div className="text-md text-text-secondary leading-relaxed whitespace-pre-wrap">{rubric}</div>
      </section>

      <section>
        <h3 className="text-lg font-semibold text-text-primary mb-2">Model Answer</h3>
        <div className="text-md text-text-secondary leading-relaxed whitespace-pre-wrap bg-surface p-3 border border-border">
          {modelAnswer}
        </div>
      </section>
    </div>
  );
}
