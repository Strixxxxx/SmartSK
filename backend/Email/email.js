const nodemailer = require('nodemailer');
const { getConnection, sql } = require('../database/database');
const express = require('express');
const router = express.Router();
const { addAuditTrail } = require('../audit/auditService');

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
      
      <p>If you believe this is an error or would like to provide additional information, please go to your respective Barangay SK Hall.</p>
      
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

// OTP Logic for Forgot Password

const generateOTP = () => {
  return Math.floor(100000 + Math.random() * 900000).toString();
};

// Sending Emails

const sendPasswordResetEmail = async (email) => {
  try {
    // Generate OTP
    const resetCode = generateOTP();
    
    // Get user information from database
    const pool = await getConnection();
    const userResult = await pool.request()
      .input('email', sql.VarChar, email)
      .query('SELECT * FROM userInfo WHERE emailAddress = @email');
    
    if (userResult.recordset.length === 0) {
      return { success: false, message: 'User not found', otp: null };
    }
    
    const htmlContent = createPasswordResetEmail(resetCode);
    
    const mailOptions = {
      from: '"Smart SK" <smartsk2025@gmail.com>',
      to: email,
      subject: 'Smart SK Password Reset',
      html: htmlContent
    };
    
    const info = await transporter.sendMail(mailOptions);
    addAuditTrail({
        actor: 'S',
        module: 'E',
        userID: userResult.recordset[0].userID,
        actions: 'send-password-reset-email',
        oldValue: null,
        newValue: null,
        descriptions: 'Password reset email sent'
    });
    return { success: true, message: 'Password reset email sent', otp: resetCode };
  } catch (error) {
    console.error('Error sending password reset email');
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
  generateOTP
};