/**
 * lessonEngine.js
 * Walks through a lesson's scripted auction one step at a time.
 *
 * The engine contains NO bridge logic. Its only rule is:
 *   - a step whose seat is the student's seat waits for the student to bid;
 *   - any other step is played automatically by the computer;
 *   - a student call is correct only if it equals the step's `call` (or one of its `acceptable` calls).
 *
 * Status values: "ready" (lesson in progress), "completed" (all steps played), "failed" (wrong call).
 */

export class LessonEngine {
  /**
   * @param {Object} lesson - A lesson object loaded from JSON.
   */
  constructor(lesson) {
    this.lesson = lesson;
    this.student = lesson.student || 'S';
    this.index = 0;
    this.calls = [];
    this.status = 'ready';
    this.failure = null;
    this.#checkCompleted();
  }

  /** The step that comes next, or null when the auction is finished. */
  get currentStep() {
    return this.lesson.auction[this.index] ?? null;
  }

  /** True when the next step belongs to the student and the lesson is still running. */
  isStudentTurn() {
    const step = this.currentStep;
    return this.status === 'ready' && step !== null && step.seat === this.student;
  }

  /** True when the next step belongs to a computer-controlled seat. */
  isComputerTurn() {
    const step = this.currentStep;
    return this.status === 'ready' && step !== null && step.seat !== this.student;
  }

  /**
   * Play the next computer step exactly as scripted.
   * @returns {{seat:string, call:string}|null} The call that was made, or null if it is not the computer's turn.
   */
  playComputerStep() {
    if (!this.isComputerTurn()) return null;
    const step = this.currentStep;
    const made = { seat: step.seat, call: step.call };
    this.calls.push(made);
    this.index += 1;
    this.#checkCompleted();
    return made;
  }

  /**
   * Check the student's call against the script.
   * A wrong call fails the lesson immediately.
   * @param {string} call - Call code such as "2S" or "P".
   * @returns {{correct:boolean, step:Object}}
   */
  submitStudentCall(call) {
    if (!this.isStudentTurn()) {
      throw new Error('It is not the student\'s turn.');
    }

    const step = this.currentStep;
    const accepted = [step.call, ...(step.acceptable || [])];

    if (accepted.includes(call)) {
      this.calls.push({ seat: step.seat, call });
      this.index += 1;
      this.#checkCompleted();
      return { correct: true, step };
    }

    this.status = 'failed';
    this.failure = {
      stepIndex: this.index,
      studentCall: call,
      expectedCall: step.call,
    };
    return { correct: false, step };
  }

  /**
   * Summary of how the lesson ended, for the explanation screen and progress tracking.
   * @returns {{lessonId:string, outcome:'pass'|'fail', stepIndex:number|null, studentCall:string|null, expectedCall:string|null}}
   */
  getResult() {
    if (this.status === 'failed') {
      return { lessonId: this.lesson.id, outcome: 'fail', ...this.failure };
    }
    return {
      lessonId: this.lesson.id,
      outcome: 'pass',
      stepIndex: null,
      studentCall: null,
      expectedCall: null,
    };
  }

  /** Mark the lesson completed once every step has been consumed. */
  #checkCompleted() {
    if (this.status === 'ready' && this.index >= this.lesson.auction.length) {
      this.status = 'completed';
    }
  }
}
