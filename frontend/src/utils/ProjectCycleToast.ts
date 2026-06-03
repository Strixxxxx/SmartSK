import { toast, ToastOptions } from 'react-toastify';

export function toastSuccess(msg: string, opts?: ToastOptions): void {
  toast.success(msg, {
    position: 'bottom-right',
    autoClose: 5000,
    closeOnClick: true,
    pauseOnHover: true,
    ...opts
  });
}

export function toastError(msg: string, opts?: ToastOptions): void {
  toast.error(msg, {
    position: 'bottom-right',
    autoClose: 5000,
    closeOnClick: true,
    pauseOnHover: true,
    ...opts
  });
}

export function toastInfo(msg: string, opts?: ToastOptions): void {
  toast.info(msg, {
    position: 'bottom-right',
    autoClose: 5000,
    closeOnClick: true,
    pauseOnHover: true,
    ...opts
  });
}

export function showMilestoneToast(statusID: number, role: string, projectName: string): void {
  const isSKC = role === 'SK Chairperson' || role === 'SKC';
  const isSKS = role === 'SK Secretary' || role === 'SKS';
  const year = new Date().getFullYear();

  let msg = '';

  switch (statusID) {
    case 1:
      if (isSKC) {
        msg = `Project Cycle successfully created for Fiscal Year ${year}! Please check the project card for next steps.`;
      } else if (isSKS) {
        msg = `A new Project Cycle for Fiscal Year ${year} has been started! Please check the project card for next steps.`;
      } else {
        msg = `A new Project Cycle for Fiscal Year ${year} has begun.`;
      }
      break;

    case 2:
      if (isSKC) {
        msg = `Youth Profiling validated! The project is now at Checkpoint 2 — CBYDP Drafting.`;
      } else {
        msg = `The SK Chairperson has validated the Youth Profiling submission. The project cycle is now at Checkpoint 2 — CBYDP Drafting Phase.`;
      }
      break;

    case 4:
      if (isSKC) {
        msg = `SK Session attendance validated! The project has moved to Checkpoint 4 — KK General Assembly.`;
      } else if (isSKS) {
        msg = `Session attendance approved. The project is now at Checkpoint 4 — KK General Assembly.`;
      }
      break;

    case 5:
      if (isSKC) {
        msg = `KK General Assembly documents validated! The project has moved to Checkpoint 5 — ABYIP Budget Draft.`;
      } else {
        msg = `KK General Assembly is complete! The project has moved to Checkpoint 5 — ABYIP Budget Draft.`;
      }
      break;

    case 8:
      if (isSKC) {
        msg = `SK Resolution has been uploaded! The project has moved to Checkpoint 8 — Sangguniang Barangay Review. Next step: Prepare the project proposal bundle. You will need to wait for the City Approval through AI evaluation.`;
      } else {
        msg = `Checkpoint 7 is complete. The project is now at Checkpoint 8 — Sangguniang Barangay Review.`;
      }
      break;

    case 12:
      if (isSKC) {
        msg = `The project is now at Checkpoint 12 — Procurement Phase. Next step: Prepare and upload the Procurement Documentation via the 'Support Documents' button. Once submitted, the Barangay Captain will review and validate it to move the project to Project Execution.`;
      } else {
        msg = `The project has passed Checkpoint 12 — Procurement Phase. The project is now in the execution phase.`;
      }
      break;

    default:
      msg = `The project '${projectName}' has reached Checkpoint ${statusID}.`;
      break;
  }

  if (msg) {
    toast.success(msg, {
      position: 'bottom-right',
      autoClose: 10000,
      closeOnClick: true,
      pauseOnHover: true,
    });
  }
}

