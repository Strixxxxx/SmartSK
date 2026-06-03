const nodemailer = require('nodemailer');
const { getConnection, sql } = require('../database/database');
const express = require('express');
const router = express.Router();
const { addAuditTrail } = require('../audit/auditService');
const { decrypt } = require('../utils/crypto');

// Configure email transporter
const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS,
  }
});

// EMAIL TEMPLATES - All templates defined here

const createAccountCreationEmail = (username) => {
  return `
  <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; border: 1px solid #ddd; border-radius: 5px; overflow: hidden;">
    <div style="background-color: #4285f4; padding: 15px; text-align: center;">
      <h2 style="color: white; margin: 0;">Welcome to Smart SK</h2>
    </div>
    <div style="padding: 20px;">
      <p>Your account has been successfully created!</p>
      
      <div style="background-color: #f5f5f5; padding: 15px; margin: 15px 0;">
        <p><strong>Username:</strong> ${username}</p>
      </div>
      
      <div style="background-color: #f5f5f5; padding: 15px; margin: 15px 0;">
        <p><strong>Default Password:</strong> ${username}.SmartSK2025</p>
        <p style="color: #d14; margin-top: 10px;"><strong>Note:</strong> Please take note that the default password can be changed upon first login.</p>
      </div>
      
      <p>You can now log in to your account using these credentials.</p>
      
      <p>Best regards,<br>Smart SK Team</p>
    </div>
  </div>
  `;
};

const createPasswordResetEmail = (code) => {
  return `
  <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; border: 1px solid #ddd; border-radius: 5px; overflow: hidden;">
    <div style="background-color: #4285f4; padding: 15px; text-align: center;">
      <h2 style="color: white; margin: 0;">Smart SK Password Reset</h2>
    </div>
    <div style="padding: 20px;">
      <p>You have requested to reset your password. Please use the following verification code to continue:</p>
      
      <div style="background-color: #f5f5f5; padding: 15px; text-align: center; font-size: 24px; letter-spacing: 5px; margin: 20px 0;">
        ${code}
      </div>
      
      <p>This code will expire in 5 minutes.</p>
      
      <p>If you did not request a password reset, please ignore this email or contact support if you have concerns.</p>
      
      <p>Best regards,<br>Smart SK Team</p>
    </div>
  </div>
  `;
};

const createAccountApprovalEmail = (username) => {
  return `
  <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; border: 1px solid #ddd; border-radius: 5px; overflow: hidden;">
    <div style="background-color: #4285f4; padding: 15px; text-align: center;">
      <h2 style="color: white; margin: 0;">Account Application Status</h2>
    </div>
    <div style="padding: 20px;">
      <p>Dear ${username},</p>
      
      <p>We are pleased to inform you that your account application for Smart SK has been <strong>approved</strong>.</p>
      
      <p>You can now log in to your account using your registered username and password.</p>
      
      <p>Thank you for joining our platform!</p>
      
      <p>Best regards,<br>Smart SK Team</p>
    </div>
  </div>
  `;
};

const createAccountRejectionEmail = (username, reason) => {
  return `
  <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; border: 1px solid #ddd; border-radius: 5px; overflow: hidden;">
    <div style="background-color: #4285f4; padding: 15px; text-align: center;">
      <h2 style="color: white; margin: 0;">Account Application Status</h2>
    </div>
    <div style="padding: 20px;">
      <p>Dear ${username},</p>
      
      <p>We regret to inform you that your application for a Smart SK account has not been approved at this time.</p>
      
      <div style="background-color: #f5f5f5; padding: 15px; border-left: 4px solid #4285f4; margin: 15px 0;">
        <p><strong>Reason:</strong> ${reason || 'Your application did not meet our current requirements.'}</p>
      </div>
      
      <p>If you believe this is an error or would like to provide additional information, please go to your respective Barangay SK Hall and contact the Admin for further assistance.</p>
      
      <p>Thank you for your interest in Smart SK.</p>
      
      <p>Best regards,<br>Smart SK Team</p>
    </div>
  </div>
  `;
};

const createProjectStatusEmail = (project, status, remarks) => {
  let subject = '';
  let statusText = '';
  let statusHeading = '';

  if (status === 'approved') {
    subject = 'Project Proposal Status: Approved';
    statusText = 'approved';
    statusHeading = 'Project Approved';
  } else if (status === 'denied') {
    subject = 'Project Proposal Status: Declined';
    statusText = 'denied';
    statusHeading = 'Project Denied';
  } else if (status === 'revised') {
    subject = 'Project Proposal Status: Revision Required';
    statusText = 'requires some revisions before it can be approved';
    statusHeading = 'Project Revision Required';
  }

  return {
    subject,
    html: `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; border: 1px solid #ddd; border-radius: 5px; overflow: hidden;">
      <div style="background-color: #4285f4; padding: 15px; text-align: center;">
        <h2 style="color: white; margin: 0;">${statusHeading}</h2>
      </div>
      <div style="padding: 20px;">
        <p>Your project proposal "${project.title}" ${statusText}.</p>
        
        <div style="margin: 20px 0;">
          <h3 style="margin-bottom: 5px;">Reviewer Remarks:</h3>
          <div style="background-color: #f5f5f5; padding: 15px; border-left: 4px solid #4285f4;">
            ${remarks || 'No specific remarks provided.'}
          </div>
        </div>
        
        ${status === 'revised' ? `
        <p>Please log in to the <a href="http://localhost:5173" style="color: #4285f4; text-decoration: none; font-weight: bold;">SmartSK</a> platform to make the necessary revisions to your project.</p>
        ` : `
        <p>Please log in to the <a href="http://localhost:5173" style="color: #4285f4; text-decoration: none; font-weight: bold;">SmartSK</a> platform to view more details.</p>
        `}
        
        <p>Best regards,<br>Smart SK Team</p>
      </div>
    </div>
    `
  };
};

const createProjectDeadlineEmail = (projName, projType, statusName, daysStuck, notifType) => {
  const isUrgent = notifType === 'URGENT';
  const isFiscal = notifType === 'FISCAL_DEADLINE';
  
  let headerColor = '#f57c00'; // Warning (Orange)
  let title = '📋 Project Status Reminder';
  let legalBasis = 'RA 10742';

  if (isUrgent) {
    headerColor = '#c62828'; // Urgent (Red)
    title = '⚠️ URGENT: Project Deadline Alert';
  } else if (isFiscal) {
    headerColor = '#d32f2f'; // Fiscal (Dark Red)
    title = '📅 CRITICAL: Fiscal Year Deadline';
    legalBasis = 'JMC No. 1 s. 2019';
  }

  return `
  <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; border: 1px solid #ddd; border-radius: 5px; overflow: hidden;">
    <div style="background-color: ${headerColor}; padding: 15px; text-align: center;">
      <h2 style="color: white; margin: 0;">${title}</h2>
    </div>
    <div style="padding: 20px;">
      <p>This is an automated regulatory alert from the Smart SK system.</p>
      <div style="background-color: #f5f5f5; padding: 15px; border-left: 4px solid ${headerColor}; margin: 15px 0;">
        <p><strong>Project:</strong> ${projName} (${projType})</p>
        <p><strong>Current Status:</strong> ${statusName}</p>
        ${!isFiscal ? `<p><strong>Days in Current Status:</strong> ${daysStuck} day(s)</p>` : ''}
      </div>
      
      ${isFiscal 
        ? `<p style="color: #d32f2f; font-weight: bold;">⚠️ CRITICAL ACTION REQUIRED: The October 16 deadline for budget submission is approaching. Per ${legalBasis}, failure to finalize your ABYIP may delay the release of SK funds for the next fiscal year.</p>`
        : isUrgent
          ? `<p style="color: #c62828; font-weight: bold;">⚠️ IMMEDIATE ACTION REQUIRED: This project phase has exceeded the allowed timeline. Failure to advance may result in legal non-compliance per ${legalBasis}.</p>`
          : `<p>Please log in to Smart SK and advance this project to its next milestone to stay on track with legal submission deadlines (7-day review rule).</p>`
      }
      
      <p style="font-size: 12px; color: #666; margin-top: 20px;">Reference: ${legalBasis} and SK Reform Act Guidelines.</p>
      <p>Best regards,<br>Smart SK System</p>
    </div>
  </div>
  `;
};

const createMeetingScheduledEmail = (projName, meetingDate) => {
  return `
  <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; border: 1px solid #ddd; border-radius: 5px; overflow: hidden;">
    <div style="background-color: #4285f4; padding: 15px; text-align: center;">
      <h2 style="color: white; margin: 0;">Meeting Scheduled</h2>
    </div>
    <div style="padding: 20px;">
      <p>Dear SK Council,</p>
      <p>A finalization meeting for project plan <strong>"${projName}"</strong> has been officially scheduled.</p>
      <div style="background-color: #f5f5f5; padding: 15px; border-left: 4px solid #4285f4; margin: 15px 0;">
        <p><strong>Scheduled Date & Time:</strong> ${meetingDate}</p>
      </div>
      <p>Please make sure to attend and check your calendar.</p>
      <p>Best regards,<br>Smart SK System</p>
    </div>
  </div>
  `;
};

const createMeetingRescheduledEmail = (projName, meetingDate, reason) => {
  return `
  <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; border: 1px solid #ddd; border-radius: 5px; overflow: hidden;">
    <div style="background-color: #f57c00; padding: 15px; text-align: center;">
      <h2 style="color: white; margin: 0;">Meeting Rescheduled</h2>
    </div>
    <div style="padding: 20px;">
      <p>Dear SK Council,</p>
      <p>The finalization meeting for project plan <strong>"${projName}"</strong> has been rescheduled.</p>
      <div style="background-color: #fff3e0; padding: 15px; border-left: 4px solid #f57c00; margin: 15px 0;">
        <p><strong>New Date & Time:</strong> ${meetingDate}</p>
        <p><strong>Reason for Rescheduling:</strong><br/>${reason}</p>
      </div>
      <p>Please update your calendar accordingly and ensure your attendance.</p>
      <p>Best regards,<br>Smart SK System</p>
    </div>
  </div>
  `;
};

// OTP Logic for Forgot Password

const generateOTP = () => {
  return Math.floor(100000 + Math.random() * 900000).toString();
};

// Sending Emails

const sendPasswordResetEmail = async (email, userID) => {
  try {
    // Generate OTP
    const resetCode = generateOTP();

    const htmlContent = createPasswordResetEmail(resetCode);

    const mailOptions = {
      from: '"Smart SK" <smartsk2025@gmail.com>',
      to: email,
      subject: 'Smart SK Password Reset',
      html: htmlContent
    };

    await transporter.sendMail(mailOptions);

    addAuditTrail({
      actor: 'S',
      module: 'E',
      userID: userID,
      actions: 'send-password-reset-email',
      oldValue: null,
      newValue: null,
      descriptions: 'Password reset email sent'
    });
    return { success: true, message: 'Password reset email sent', otp: resetCode };
  } catch (error) {
    console.error('Error sending password reset email:', error);
    return { success: false, error: error.message, otp: null };
  }
};

const sendAccountApprovalEmail = async (userId) => {
  try {
    // Get user information from pendingInfo table instead of userInfo
    const pool = await getConnection();
    const userResult = await pool.request()
      .input('userId', sql.Int, userId)
      .query('SELECT * FROM pendingInfo WHERE userID = @userId');

    if (userResult.recordset.length === 0) {
      throw new Error('User not found');
    }

    const user = userResult.recordset[0];
    const htmlContent = createAccountApprovalEmail(user.userName);

    const mailOptions = {
      from: '"Smart SK" <smartsk2025@gmail.com>',
      to: user.emailAddress,
      subject: 'Smart SK Account Status',
      html: htmlContent
    };

    const info = await transporter.sendMail(mailOptions);
    addAuditTrail({
      actor: 'S',
      module: 'E',
      userID: userId,
      actions: 'send-account-approval-email',
      oldValue: null,
      newValue: null,
      descriptions: 'Account approval email sent'
    });
    return { success: true, messageId: info.messageId };
  } catch (error) {
    console.error('Error sending account approval email');
    return { success: false, error: error.message };
  }
};

const sendAccountRejectionEmail = async (emailAddress, fullName, reason) => {
  try {
    if (!emailAddress || !fullName) {
      throw new Error('Email address and full name are required');
    }

    const htmlContent = createAccountRejectionEmail(fullName, reason);

    const mailOptions = {
      from: '"Smart SK" <smartsk2025@gmail.com>',
      to: emailAddress,
      subject: 'Smart SK Account Status',
      html: html
    };

    await transporter.sendMail(mailOptions);
    addAuditTrail({
      actor: 'S',
      module: 'E',
      userID: null,
      actions: 'send-account-rejection-email',
      oldValue: null,
      newValue: reason,
      descriptions: 'Account rejection email sent'
    });

    return {
      success: true,
      message: 'Account rejection email sent successfully'
    };
  } catch (error) {
    console.error('Error sending account rejection email');
    return {
      success: false,
      message: 'Failed to send account rejection email',
      error: error.message
    };
  }
};

const sendAccountCreationEmail = async (username, emailAddress) => {
  try {
    const htmlContent = createAccountCreationEmail(username);

    const mailOptions = {
      from: '"Smart SK" <smartsk2025@gmail.com>',
      to: emailAddress,
      subject: 'Welcome to Smart SK - Account Created',
      html: htmlContent
    };

    const info = await transporter.sendMail(mailOptions);
    addAuditTrail({
      actor: 'S',
      module: 'E',
      userID: null,
      actions: 'send-account-creation-email',
      oldValue: null,
      newValue: null,
      descriptions: 'Account creation email sent'
    });
    return { success: true, messageId: info.messageId };
  } catch (error) {
    console.error('Error sending account creation email');
    return { success: false, error: error.message };
  }
};

const sendProjectStatusEmail = async (projectId, status, remarks) => {
  try {
    // Get project and user information from database
    const pool = await getConnection();
    const projectResult = await pool.request()
      .input('projectId', sql.Int, projectId)
      .query(`
        SELECT p.*, u.emailAddress, u.userName 
        FROM projects p
        JOIN userInfo u ON p.userID = u.userID
        WHERE p.projectID = @projectId
      `);

    if (projectResult.recordset.length === 0) {
      throw new Error('Project not found');
    }

    const project = projectResult.recordset[0];
    const { subject, html } = createProjectStatusEmail(project, status, remarks);

    const mailOptions = {
      from: '"Smart SK" <smartsk2025@gmail.com>',
      to: project.emailAddress,
      subject: subject,
      html: html
    };

    const info = await transporter.sendMail(mailOptions);
    addAuditTrail({
      actor: 'S',
      module: 'E',
      userID: project.userID,
      actions: 'send-project-status-email',
      oldValue: null,
      newValue: `status: ${status}`,
      descriptions: 'Project status email sent'
    });
    return { success: true, messageId: info.messageId };
  } catch (error) {
    console.error('Error sending project status email');
    return { success: false, error: error.message };
  }
};

const sendRegistrationApprovalEmail = async (userID) => {
  try {
    const pool = await getConnection();
    const userResult = await pool.request()
      .input('userID', sql.Int, userID)
      .query('SELECT fullName, emailAddress FROM preUserInfo WHERE userID = @userID');

    if (userResult.recordset.length === 0) {
      throw new Error(`User with ID ${userID} not found in preUserInfo.`);
    }

    const user = userResult.recordset[0];
    const decryptedFullName = decrypt(user.fullName);
    const decryptedEmail = decrypt(user.emailAddress);

    const htmlContent = createAccountApprovalEmail(decryptedFullName);

    const mailOptions = {
      from: '"Smart SK" <smartsk2025@gmail.com>',
      to: decryptedEmail,
      subject: 'Your Smart SK Account has been Approved',
      html: htmlContent
    };

    await transporter.sendMail(mailOptions);
    console.log(`Registration approval email sent to ${decryptedEmail}`);
    return { success: true };
  } catch (error) {
    console.error(`Error sending registration approval email for userID ${userID}:`, error);
    return { success: false, error: error.message };
  }
};

const sendRegistrationRejectionEmail = async (userID, reason) => {
  try {
    const pool = await getConnection();
    const userResult = await pool.request()
      .input('userID', sql.Int, userID)
      .query('SELECT fullName, emailAddress FROM preUserInfo WHERE userID = @userID');

    if (userResult.recordset.length === 0) {
      throw new Error(`User with ID ${userID} not found in preUserInfo.`);
    }

    const user = userResult.recordset[0];
    const decryptedFullName = decrypt(user.fullName);
    const decryptedEmail = decrypt(user.emailAddress);

    const htmlContent = createAccountRejectionEmail(decryptedFullName, reason);

    const mailOptions = {
      from: '"Smart SK" <smartsk2025@gmail.com>',
      to: decryptedEmail,
      subject: 'Your Smart SK Account Application Status',
      html: htmlContent
    };

    await transporter.sendMail(mailOptions);
    console.log(`Registration rejection email sent to ${decryptedEmail}`);
    return { success: true };
  } catch (error) {
    console.error(`Error sending registration rejection email for userID ${userID}:`, error);
    return { success: false, error: error.message };
  }
};

const sendProjectDeadlineEmail = async (barangayID, projName, projType, statusName, daysStuck, notifType) => {
  try {
    const pool = await getConnection();
    // Fetch SK Chairperson and Secretary emails for this barangay
    const userResult = await pool.request()
      .input('barangayID', sql.Int, barangayID)
      .query(`
        SELECT u.emailAddress
        FROM userInfo u
        JOIN roles r ON u.position = r.roleID
        WHERE u.barangay = @barangayID
          AND r.roleName IN ('SKC', 'SKS')
          AND u.isArchived = 0
      `);

    if (userResult.recordset.length === 0) {
      console.warn(`[DeadlineEmail] No SKC/SKS found for barangayID ${barangayID}.`);
      return { success: false, message: 'No recipients found.' };
    }

    const recipients = userResult.recordset
      .map(r => decrypt(r.emailAddress))
      .filter(Boolean)
      .join(',');

    const isUrgent = notifType === 'URGENT';
    const isFiscal = notifType === 'FISCAL_DEADLINE';
    
    let subject = `📋 Reminder: Project "${projName}" Status Update Needed`;
    
    if (isFiscal) {
      subject = `📅 CRITICAL: October 16 Budget Deadline Alert ("${projName}")`;
    } else if (isUrgent) {
      subject = `⚠️ URGENT: Project "${projName}" Deadline Alert`;
    }

    const htmlContent = createProjectDeadlineEmail(projName, projType, statusName, daysStuck, notifType);

    await transporter.sendMail({
      from: '"Smart SK" <smartsk2025@gmail.com>',
      to: recipients,
      subject,
      html: htmlContent
    });

    console.log(`[DeadlineEmail] Sent "${notifType}" email for project ${projName} to ${recipients}.`);
    return { success: true };
  } catch (error) {
    console.error('[DeadlineEmail] Error sending deadline email:', error.message);
    return { success: false, error: error.message };
  }
};

const sendProjectReviewVerdictEmail = async (barangayID, projName, action, notes) => {
  try {
    const pool = await getConnection();
    const userResult = await pool.request()
      .input('barangayID', sql.Int, barangayID)
      .query(`
        SELECT u.emailAddress
        FROM userInfo u
        JOIN roles r ON u.position = r.roleID
        JOIN skTerms bt ON u.termID = bt.termID
        WHERE u.barangay = @barangayID
          AND r.roleName IN ('SKC', 'SKS')
          AND u.isArchived = 0
          AND bt.isCurrent = 1
      `);

    if (userResult.recordset.length === 0) {
      console.warn(`[VerdictEmail] No active SKC/SKS found for barangayID ${barangayID}.`);
      return { success: false, message: 'No recipients found.' };
    }

    const recipients = userResult.recordset
      .map(r => decrypt(r.emailAddress))
      .filter(Boolean)
      .join(',');

    const isApproval = action === 'approve';
    const subject = isApproval
      ? `✅ SmartSK: Barangay Captain Endorsed & Approved "${projName}"`
      : `⚠️ SmartSK: Revision Requested by Barangay Captain for "${projName}"`;

    const htmlContent = `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; border: 1px solid #ddd; border-radius: 5px; overflow: hidden;">
      <div style="background-color: ${isApproval ? '#2e7d32' : '#c62828'}; padding: 15px; text-align: center;">
        <h2 style="color: white; margin: 0;">Barangay Captain Review Verdict</h2>
      </div>
      <div style="padding: 20px;">
        <p>Dear SK Council,</p>
        <p>This is to notify you that the Barangay Captain has completed the review of your project plan:</p>
        <div style="background-color: #f5f5f5; padding: 15px; border-left: 4px solid ${isApproval ? '#2e7d32' : '#c62828'}; margin: 15px 0;">
          <p><strong>Project Plan:</strong> ${projName}</p>
          <p><strong>Review Verdict:</strong> <span style="color: ${isApproval ? '#2e7d32' : '#c62828'}; font-weight: bold;">${isApproval ? 'APPROVED / ENDORSED' : 'REVISIONS REQUIRED'}</span></p>
        </div>
        
        <div style="margin: 20px 0;">
          <h3 style="margin-bottom: 5px;">Captain's Verdict Notes:</h3>
          <div style="background-color: #f9f9f9; padding: 15px; border: 1px solid #eee; border-radius: 4px; font-style: italic; white-space: pre-line;">
            ${notes.trim()}
          </div>
        </div>

        <p>${isApproval 
          ? 'The project has successfully advanced to <strong>Checkpoint 5: QCYDO Validation</strong>.' 
          : 'The project has been returned to <strong>Checkpoint 2: Proposal Compilation</strong>. Please coordinate a session and make the requested corrections.'}</p>
        
        <p>Please log in to the <a href="http://localhost:5173" style="color: #4285f4; text-decoration: none; font-weight: bold;">SmartSK</a> platform to view the updated work notes and agenda section.</p>
        
        <p>Best regards,<br>Smart SK System</p>
      </div>
    </div>
    `;

    await transporter.sendMail({
      from: '"Smart SK" <smartsk2025@gmail.com>',
      to: recipients,
      subject,
      html: htmlContent
    });

    console.log(`[VerdictEmail] Sent email notification to ${recipients}.`);
    return { success: true };
  } catch (error) {
    console.error('[VerdictEmail] Error sending review verdict email:', error.message);
    return { success: false, error: error.message };
  }
};

const sendBcptOverrideEmail = async (barangayID, projName) => {
  try {
    const pool = await getConnection();
    const userResult = await pool.request()
      .input('barangayID', sql.Int, barangayID)
      .query(`
        SELECT u.emailAddress
        FROM userInfo u
        JOIN roles r ON u.position = r.roleID
        JOIN skTerms bt ON u.termID = bt.termID
        WHERE u.barangay = @barangayID
          AND r.roleName IN ('SKC', 'SKS')
          AND u.isArchived = 0
          AND bt.isCurrent = 1
      `);

    if (userResult.recordset.length === 0) {
      console.warn(`[OverrideEmail] No active SKC/SKS found for barangayID ${barangayID}.`);
      return { success: false, message: 'No recipients found.' };
    }

    const recipients = userResult.recordset
      .map(r => decrypt(r.emailAddress))
      .filter(Boolean)
      .join(',');

    const subject = `⚠️ SmartSK: Barangay Captain Bypassed SK Session for "${projName}"`;

    const htmlContent = `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; border: 1px solid #ddd; border-radius: 5px; overflow: hidden;">
      <div style="background-color: #b45309; padding: 15px; text-align: center;">
        <h2 style="color: white; margin: 0;">Barangay Captain: Session Override Notice</h2>
      </div>
      <div style="padding: 20px;">
        <p>Dear SK Council,</p>
        <p>This is an official transparency notice. The Barangay Captain has used the administrative override to bypass the SK Session attendance requirement for the following project plan:</p>
        <div style="background-color: #fef3c7; padding: 15px; border-left: 4px solid #b45309; margin: 15px 0;">
          <p><strong>Project Plan:</strong> ${projName}</p>
          <p><strong>Action:</strong> <span style="color: #b45309; font-weight: bold;">SK Session Bypassed — Progressed to Checkpoint 4: Brgy. Captain's Approval</span></p>
          <p><strong>Reason:</strong> Full attendance quorum could not be met. The Barangay Captain exercised discretionary administrative authority.</p>
        </div>
        <p>The project plan will now proceed directly to the Barangay Captain's formal review and endorsement phase.</p>
        <p>Please log in to the <a href="http://localhost:5173" style="color: #4285f4; text-decoration: none; font-weight: bold;">SmartSK</a> platform to review the updated project tracker and work notes.</p>
        <p>Best regards,<br>Smart SK System</p>
      </div>
    </div>
    `;

    await transporter.sendMail({
      from: '"Smart SK" <smartsk2025@gmail.com>',
      to: recipients,
      subject,
      html: htmlContent
    });

    console.log(`[OverrideEmail] Sent bypass notification to ${recipients}.`);
    return { success: true };
  } catch (error) {
    console.error('[OverrideEmail] Error sending override notification email:', error.message);
    return { success: false, error: error.message };
  }
};

const sendExecutionCompleteEmailToBCPT = async (barangayID, projName) => {
  try {
    const pool = await getConnection();
    const userResult = await pool.request()
      .input('barangayID', sql.Int, barangayID)
      .query(`
        SELECT u.emailAddress
        FROM userInfo u
        JOIN roles r ON u.position = r.roleID
        JOIN skTerms bt ON u.termID = bt.termID
        WHERE u.barangay = @barangayID
          AND r.roleName = 'BCPT'
          AND u.isArchived = 0
          AND bt.isCurrent = 1
      `);

    if (userResult.recordset.length === 0) {
      console.warn(`[ExecutionEmail] No active BCPT found for barangayID ${barangayID}.`);
      return { success: false, message: 'No recipients found.' };
    }

    const recipients = userResult.recordset
      .map(r => decrypt(r.emailAddress))
      .filter(Boolean)
      .join(',');

    const subject = `📢 SmartSK: Checkpoint 11 PPA Execution Complete for "${projName}"`;

    const htmlContent = `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; border: 1px solid #ddd; border-radius: 5px; overflow: hidden;">
      <div style="background-color: #0284c7; padding: 15px; text-align: center;">
        <h2 style="color: white; margin: 0;">PPA Execution Checklist Completed</h2>
      </div>
      <div style="padding: 20px;">
        <p>Dear Barangay Captain,</p>
        <p>This is to notify you that the SK Council has completed execution of all programs/PPAs for the project plan:</p>
        <div style="background-color: #f0f9ff; padding: 15px; border-left: 4px solid #0284c7; margin: 15px 0;">
          <p><strong>Project Plan:</strong> ${projName}</p>
          <p><strong>Status:</strong> All PPAs checked off and executed.</p>
        </div>
        <p>Please log in to the <a href="http://localhost:5173" style="color: #4285f4; text-decoration: none; font-weight: bold;">SmartSK</a> platform to validate this execution checklist, sign off, and formally close this project plan.</p>
        <p>Best regards,<br>Smart SK System</p>
      </div>
    </div>
    `;

    await transporter.sendMail({
      from: '"Smart SK" <smartsk2025@gmail.com>',
      to: recipients,
      subject,
      html: htmlContent
    });

    console.log(`[ExecutionEmail] Sent bypass notification to ${recipients}.`);
    return { success: true };
  } catch (error) {
    console.error('[ExecutionEmail] Error sending override notification email:', error.message);
    return { success: false, error: error.message };
  }
};

const sendMeetingScheduledEmail = async (barangayID, projName, meetingDate) => {
  try {
    const pool = await getConnection();
    const userResult = await pool.request()
      .input('barangayID', sql.Int, barangayID)
      .query(`
        SELECT u.emailAddress
        FROM userInfo u
        JOIN roles r ON u.position = r.roleID
        JOIN skTerms bt ON u.termID = bt.termID
        WHERE u.barangay = @barangayID
          AND r.roleName IN ('SKC', 'SKS', 'SKK', 'SKT')
          AND u.isArchived = 0
          AND bt.isCurrent = 1
      `);

    if (userResult.recordset.length === 0) {
      console.warn(`[MeetingEmail] No active SK members found for barangayID ${barangayID}.`);
      return { success: false, message: 'No recipients found.' };
    }

    const recipients = userResult.recordset
      .map(r => decrypt(r.emailAddress))
      .filter(Boolean)
      .join(',');

    const subject = `📅 SmartSK: Meeting Scheduled for "${projName}"`;
    const htmlContent = createMeetingScheduledEmail(projName, meetingDate);

    await transporter.sendMail({
      from: '"Smart SK" <smartsk2025@gmail.com>',
      to: recipients,
      subject,
      html: htmlContent
    });

    console.log(`[MeetingEmail] Sent scheduled notification to ${recipients}.`);
    return { success: true };
  } catch (error) {
    console.error('[MeetingEmail] Error sending scheduled notification email:', error.message);
    return { success: false, error: error.message };
  }
};

const sendMeetingRescheduledEmail = async (barangayID, projName, meetingDate, reason) => {
  try {
    const pool = await getConnection();
    const userResult = await pool.request()
      .input('barangayID', sql.Int, barangayID)
      .query(`
        SELECT u.emailAddress
        FROM userInfo u
        JOIN roles r ON u.position = r.roleID
        JOIN skTerms bt ON u.termID = bt.termID
        WHERE u.barangay = @barangayID
          AND r.roleName IN ('SKC', 'SKS', 'SKK', 'SKT')
          AND u.isArchived = 0
          AND bt.isCurrent = 1
      `);

    if (userResult.recordset.length === 0) {
      console.warn(`[MeetingEmail] No active SK members found for barangayID ${barangayID}.`);
      return { success: false, message: 'No recipients found.' };
    }

    const recipients = userResult.recordset
      .map(r => decrypt(r.emailAddress))
      .filter(Boolean)
      .join(',');

    const subject = `🔄 SmartSK: Meeting Rescheduled for "${projName}"`;
    const htmlContent = createMeetingRescheduledEmail(projName, meetingDate, reason);

    await transporter.sendMail({
      from: '"Smart SK" <smartsk2025@gmail.com>',
      to: recipients,
      subject,
      html: htmlContent
    });

    console.log(`[MeetingEmail] Sent rescheduled notification to ${recipients}.`);
    return { success: true };
  } catch (error) {
    console.error('[MeetingEmail] Error sending rescheduled notification email:', error.message);
    return { success: false, error: error.message };
  }
};

const sendBudgetRejectionEmail = async (barangayID, projName, remarks) => {
  try {
    const pool = await getConnection();
    const userResult = await pool.request()
      .input('barangayID', sql.Int, barangayID)
      .query(`
        SELECT u.emailAddress
        FROM userInfo u
        JOIN roles r ON u.position = r.roleID
        WHERE u.barangay = @barangayID
          AND r.roleName IN ('SKC', 'SKS')
          AND u.isArchived = 0
      `);

    if (userResult.recordset.length === 0) {
      console.warn(`[BudgetEmail] No active SKC/SKS found for barangayID ${barangayID}.`);
      return { success: false, message: 'No recipients found.' };
    }

    const recipients = userResult.recordset
      .map(r => decrypt(r.emailAddress))
      .filter(Boolean)
      .join(',');

    const subject = `⚠️ SmartSK: Barangay Captain Rejected Certified SK Fund Allocation for "${projName}"`;

    const htmlContent = `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; border: 1px solid #ddd; border-radius: 5px; overflow: hidden;">
      <div style="background-color: #c62828; padding: 15px; text-align: center;">
        <h2 style="color: white; margin: 0;">Budget Validation Rejected</h2>
      </div>
      <div style="padding: 20px;">
        <p>Dear SK Council,</p>
        <p>The Barangay Captain has reviewed the Certified SK Fund Allocation submitted for the project plan:</p>
        <div style="background-color: #ffebee; padding: 15px; border-left: 4px solid #c62828; margin: 15px 0;">
          <p><strong>Project Plan:</strong> ${projName}</p>
          <p><strong>Status:</strong> <span style="color: #c62828; font-weight: bold;">REJECTED</span></p>
        </div>
        
        <div style="margin: 20px 0;">
          <h3 style="margin-bottom: 5px;">Captain's Remarks:</h3>
          <div style="background-color: #f9f9f9; padding: 15px; border: 1px solid #eee; border-radius: 4px; font-style: italic; white-space: pre-line;">
            ${remarks.trim()}
          </div>
        </div>

        <p>The project remains at <strong>Checkpoint 5</strong>. Please log in to the <a href="http://localhost:5173" style="color: #4285f4; text-decoration: none; font-weight: bold;">SmartSK</a> platform to correct the budget input in the Supporting Documents modal and re-submit for validation.</p>
        <p>Best regards,<br>Smart SK System</p>
      </div>
    </div>
    `;

    await transporter.sendMail({
      from: '"Smart SK" <smartsk2025@gmail.com>',
      to: recipients,
      subject,
      html: htmlContent
    });

    console.log(`[BudgetEmail] Sent rejection email to ${recipients}.`);
    return { success: true };
  } catch (error) {
    console.error('[BudgetEmail] Error sending budget rejection email:', error.message);
    return { success: false, error: error.message };
  }
};

// API Routes for sending emails

router.post('/send-password-reset', async (req, res) => {
  try {
    const { email } = req.body;

    if (!email) {
      return res.status(400).json({
        success: false,
        message: 'Email is required'
      });
    }

    const result = await sendPasswordResetEmail(email);

    if (result.success) {
      return res.status(200).json({
        success: true,
        message: 'Password reset email sent successfully',
        otp: result.otp
      });
    } else {
      throw new Error(result.error);
    }
  } catch (error) {
    console.error('Error in send-password-reset endpoint');
    return res.status(500).json({
      success: false,
      message: 'Failed to send password reset email',
      error: error.message
    });
  }
});

// Exports
module.exports = {
  router,
  sendPasswordResetEmail,
  sendAccountApprovalEmail,
  sendAccountRejectionEmail,
  sendProjectStatusEmail,
  sendAccountCreationEmail,
  sendRegistrationApprovalEmail,
  sendRegistrationRejectionEmail,
  sendProjectDeadlineEmail,
  sendProjectReviewVerdictEmail,
  sendBcptOverrideEmail,
  sendExecutionCompleteEmailToBCPT,
  sendMeetingScheduledEmail,
  sendMeetingRescheduledEmail,
  sendBudgetRejectionEmail,
  generateOTP
};