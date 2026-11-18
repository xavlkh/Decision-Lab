/**
 * OCBC personal banking form categorisation template.
 *
 * Categories and examples are taken from the "Find the forms you need"
 * section of https://www.ocbc.com/personal-banking/help-and-support
 *
 * Use it with text, a screenshot, or a PDF of the form.
 */
import { MOCK_DB_QUESTIONS } from './mock-db.js'

export const OCBC_FORM_TEMPLATE = {
  id: 'ocbc-form-category',
  name: 'OCBC form category',
  description:
    'Review an OCBC personal banking form for completion status, product category, and action.',
  // The Playground enables the mock customer DB for this template by default.
  // The base question set stays unchanged for benchmarks and ungrounded reviews.
  mockDb: true,
  dbQuestions: MOCK_DB_QUESTIONS,
  input: `{
  "bank": "OCBC",
  "form_type": "Change of Address / Contact Details",
  "customer_id": "CUST-1001",
  "name": "Tan Wei Ming",
  "nric": "S1234567A",
  "email": "weiming.tan@example.com",
  "phone": "+65 9123 4567",
  "address": "12 Marina Boulevard, #08-01, Singapore 018982",
  "account_number": "123-456789-001",
  "signature": "Tan Wei Ming",
  "date": "2026-11-18"
}`,
  questions: [
    {
      key: 'is_ocbc_form',
      type: 'noul',
      instructions:
        'Is this an OCBC personal banking form, or a description or image of one?',
      criteria: {
        true_description:
          'The document is an OCBC Bank personal banking form, or clearly relates to one.',
        false_description:
          'The document is from another bank, an insurer, or is unrelated to OCBC.',
      },
    },
    {
      key: 'is_form_filled',
      type: 'noul',
      instructions: 'Is this form fully completed, or is it blank or incomplete?',
      criteria: {
        true_description:
          'Every field that the form asks the applicant to complete contains entered information, including names, contact details, account or card numbers, selections, dates, and a signature where required. No required field is left blank.',
        false_description:
          'The form is blank, partially completed, or missing required information in one or more fields. This includes forms with only printed template text or only some fields filled in.',
      },
    },
    {
      key: 'form_category',
      type: 'choice',
      instructions: 'Which OCBC product category does this form belong to?',
      criteria: {
        account:
          'Deposit account forms: GIRO, account closure, statements, e-Statements, adding a currency, tax residency, address or contact details, or funds transfer instructions.',
        credit_card:
          'Credit card forms: cancellation, instalments, credit limit review, supplementary card, or interbank GIRO for a credit card.',
        debit_card:
          'Debit card forms: linked accounts, foreign-currency use, replacement card, or PIN.',
        baby_bonus_card:
          'Baby Bonus Card forms: apply for a card, reissue a card or PIN, cancel the card, or change the daily limit.',
        loans:
          'Loan forms: education, tuition fee, car, home, or personal loans, including disbursement, changes, direct debit authorisation, or repayment.',
        online_banking:
          'Digital banking forms: apply for online banking, phone banking services, reset an online banking PIN, or other online banking services.',
      },
    },
    {
      key: 'form_action',
      type: 'choice',
      instructions: 'What action does this form perform?',
      criteria: {
        apply: 'Start a new account, card, loan, or online banking service.',
        change:
          'Update details, limits, linked accounts, instalments, or standing instructions.',
        cancel: 'Close an account or card.',
        reissue: 'Replace a card or reset a PIN.',
        enrol: 'Enrol for e-Statements or a service.',
        request: 'Request a statement, document, or information.',
        repay: 'Make or change a repayment or disbursement.',
        other: 'Anything else.',
      },
    },
  ],
}
