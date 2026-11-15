import dotenv from 'dotenv';
import express from 'express';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Resend } from 'resend';

const backendRoot = path.dirname(fileURLToPath(import.meta.url));
const frontendRoot = path.resolve(backendRoot, '../frontend');

dotenv.config({ path: path.resolve(backendRoot, '../.env') });

const app = express();
const port = Number(process.env.PORT || 3000);
const frontendOrigin = (process.env.FRONTEND_URL || 'https://techiemen.netlify.app').replace(/\/+$/, '');

app.use((req, res, next) => {
    res.vary('Origin');

    if (req.get('origin') === frontendOrigin) {
        res.setHeader('Access-Control-Allow-Origin', frontendOrigin);
        res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
        res.setHeader('Access-Control-Allow-Headers', 'Accept, Content-Type, X-Requested-With');
    }

    if (req.method === 'OPTIONS') {
        return req.get('origin') === frontendOrigin
            ? res.sendStatus(204)
            : res.sendStatus(403);
    }

    next();
});

app.use(express.urlencoded({ extended: false, limit: '20kb' }));
app.use(express.static(frontendRoot));

function escapeHtml(value) {
    return value.replace(/[&<>"']/g, (character) => ({
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&#039;'
    })[character]);
}

function respond(req, res, status, title, message) {
    const accept = req.get('accept') || '';
    if (req.xhr || accept.includes('application/json')) {
        return res.status(status).json({ success: status < 400, message });
    }

    res.status(status).type('html').send(
        '<!DOCTYPE html><html lang="en"><meta charset="UTF-8"><title>'
        + escapeHtml(title)
        + '</title><body><h1>'
        + escapeHtml(title)
        + '</h1><p>'
        + escapeHtml(message)
        + '</p><p><a href="/">Back to contact form</a></p></body></html>'
    );
}

app.get('/', (req, res) => {
    res.sendFile(path.join(frontendRoot, 'index.html'));
});

app.post('/submit', async (req, res) => {
    if (typeof req.body['bot-field'] === 'string' && req.body['bot-field'].trim()) {
        return respond(req, res, 400, 'Invalid submission', 'Please submit the form without filling hidden fields.');
    }

    const fields = {};
    for (const field of ['email', 'phone', 'message']) {
        if (typeof req.body[field] !== 'string') {
            return respond(req, res, 400, 'Invalid submission', 'Please complete every field with valid text.');
        }
        fields[field] = req.body[field].trim();
    }

    const budget = typeof req.body['budget-range'] === 'string'
        ? req.body['budget-range'].trim()
        : '';
    const allowedBudgets = [
        'Under 5,000',
        '5,000 - 10,000',
        '10,000 - 20,000',
        '20,000 - 50,000',
        'Over 50,000'
    ];
    const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (
        !fields.email
        || !fields.phone
        || !fields.message
        || !emailPattern.test(fields.email)
        || fields.email.length > 254
        || fields.phone.length > 20
        || fields.message.length > 2000
        || (budget && !allowedBudgets.includes(budget))
    ) {
        return respond(req, res, 400, 'Invalid submission', 'Please enter valid details and complete every field.');
    }

    const apiKey = (process.env.RESEND_API_KEY || '').trim();
    const fromAddress = (process.env.MAIL_FROM || 'onboarding@resend.dev').trim();
    const toAddresses = (process.env.MAIL_TO || 'info.techiemen.go@gmail.com')
        .split(',')
        .map((address) => address.trim())
        .filter(Boolean);
    if (!apiKey || !emailPattern.test(fromAddress) || !toAddresses.length || toAddresses.some((address) => !emailPattern.test(address))) {
        console.error('Contact form Resend configuration is incomplete or invalid.');
        return respond(req, res, 500, 'Unable to send message', 'The email service is not configured correctly. Please try again later.');
    }

    const safeEmail = escapeHtml(fields.email);
    const safePhone = escapeHtml(fields.phone);
    const safeBudget = escapeHtml(budget || 'Not specified');
    const safeMessage = escapeHtml(fields.message).replace(/\r?\n/g, '<br>');
    const fromName = (process.env.MAIL_FROM_NAME || '').trim();
    const from = fromName ? `${fromName} <${fromAddress}>` : fromAddress;
    const resend = new Resend(apiKey);

    try {
        const { error } = await resend.emails.send({
            from,
            to: toAddresses,
            replyTo: fields.email,
            subject: 'Portfolio contact form inquiry',
            text: `Email: ${fields.email}\nPhone: ${fields.phone}\nBudget: ${budget || 'Not specified'}\n\n${fields.message}`,
            html: `<p><strong>Email:</strong> ${safeEmail}</p><p><strong>Phone:</strong> ${safePhone}</p><p><strong>Budget:</strong> ${safeBudget}</p><p><strong>Message:</strong><br>${safeMessage}</p>`
        });

        if (error) {
            console.error('Contact form email failed:', error.message);
            return respond(req, res, 500, 'Unable to send message', 'Your message could not be sent right now. Please try again later.');
        }
    } catch (error) {
        console.error('Contact form email failed:', error.message);
        return respond(req, res, 500, 'Unable to send message', 'Your message could not be sent right now. Please try again later.');
    }

    return respond(req, res, 200, 'Message sent', 'Thank you! Your message has been sent successfully.');
});

if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error('PORT must be an integer between 1 and 65535.');
}

app.listen(port, () => {
    console.log(`Contact form server listening on port ${port}`);
});
