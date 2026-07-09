/** Auto-generated — npm run generate:i693-pdf-registry */
import type { PdfFieldBinding } from '@/lib/i693/pdf-field-registry-types'

export const PDF_FIELD_REGISTRY: PdfFieldBinding[] = [
  {
    "key": "applicant.a_number",
    "pdfFieldName": "form1[0].#subform[0].#area[0].Pt1Line3e_AlienNumber[0]",
    "page": 0,
    "kind": "text"
  },
  {
    "key": "applicant.apt",
    "pdfFieldName": "form1[0].#subform[0].Pt1Line2_AptSteFlrNumber[0]",
    "page": 0,
    "kind": "text"
  },
  {
    "key": "applicant.city",
    "pdfFieldName": "form1[0].#subform[0].P1Line2_CityOrTown[0]",
    "page": 0,
    "kind": "text"
  },
  {
    "key": "applicant.city_of_birth",
    "pdfFieldName": "form1[0].#subform[0].Pt1Line3_CityTownVillageofBirth[0]",
    "page": 0,
    "kind": "text"
  },
  {
    "key": "applicant.country",
    "pdfFieldName": "form1[0].#subform[0].P1Line2_Country[0]",
    "page": 0,
    "kind": "text"
  },
  {
    "key": "applicant.country_of_birth",
    "pdfFieldName": "form1[0].#subform[0].Pt1Line3_CountryofBirth[0]",
    "page": 0,
    "kind": "text"
  },
  {
    "key": "applicant.date_of_birth",
    "pdfFieldName": "form1[0].#subform[0].Pt1Line3_DateOfBirth[0]",
    "page": 0,
    "kind": "text",
    "format": "date"
  },
  {
    "key": "applicant.family_name",
    "pdfFieldName": "form1[0].#subform[0].Pt1Line1a_FamilyName[0]",
    "page": 0,
    "kind": "text"
  },
  {
    "key": "applicant.given_name",
    "pdfFieldName": "form1[0].#subform[0].Pt1Line1b_GivenName[0]",
    "page": 0,
    "kind": "text"
  },
  {
    "key": "applicant.in_care_of",
    "pdfFieldName": "form1[0].#subform[0].Pt1Line2_StreetNumberName[1]",
    "page": 0,
    "kind": "text"
  },
  {
    "key": "applicant.middle_name",
    "pdfFieldName": "form1[0].#subform[0].Pt1Line1c_MiddleName[0]",
    "page": 0,
    "kind": "text"
  },
  {
    "key": "applicant.postal_code",
    "pdfFieldName": "form1[0].#subform[0].P1Line2_PostalCode[0]",
    "page": 0,
    "kind": "text"
  },
  {
    "key": "applicant.province",
    "pdfFieldName": "form1[0].#subform[0].P1Line2_Province[0]",
    "page": 0,
    "kind": "text"
  },
  {
    "key": "applicant.sex",
    "pdfFieldName": "form1[0].#subform[0].Pt1Line3_Gender[0]",
    "page": 0,
    "kind": "mark",
    "when": "male"
  },
  {
    "key": "applicant.sex",
    "pdfFieldName": "form1[0].#subform[0].Pt1Line3_Gender[1]",
    "page": 0,
    "kind": "mark",
    "when": "female"
  },
  {
    "key": "applicant.state",
    "pdfFieldName": "form1[0].#subform[0].P1Line2_State[0]",
    "page": 0,
    "kind": "text"
  },
  {
    "key": "applicant.street",
    "pdfFieldName": "form1[0].#subform[0].Pt1Line2_StreetNumberName[0]",
    "page": 0,
    "kind": "text"
  },
  {
    "key": "applicant.uscis_online_account",
    "pdfFieldName": "form1[0].#subform[0].Pt1Line3f_USCISOnlineAcctNumber[0]",
    "page": 0,
    "kind": "text"
  },
  {
    "key": "applicant.zip",
    "pdfFieldName": "form1[0].#subform[0].P1Line2_ZipCode[0]",
    "page": 0,
    "kind": "text"
  },
  {
    "key": "application.immigration_benefit",
    "pdfFieldName": "form1[0].#subform[0].Pt1_Line4_ImmMedExamReq[0]",
    "page": 0,
    "kind": "mark",
    "when": "vaccination_only"
  },
  {
    "key": "applicant_contact.applicant_signature_date",
    "pdfFieldName": "form1[0].#subform[1].Pt2Line6_DateofSignature[0]",
    "page": 1,
    "kind": "text",
    "format": "date"
  },
  {
    "key": "applicant_contact.day_phone",
    "pdfFieldName": "form1[0].#subform[1].Pt2Line3_DaytimePhone[0]",
    "page": 1,
    "kind": "text"
  },
  {
    "key": "applicant_contact.email",
    "pdfFieldName": "form1[0].#subform[1].Pt2Line5_EmailAddress[0]",
    "page": 1,
    "kind": "text"
  },
  {
    "key": "applicant_contact.mobile_phone",
    "pdfFieldName": "form1[0].#subform[1].Pt2Line4_Mobilephone[0]",
    "page": 1,
    "kind": "text"
  },
  {
    "key": "interpreter.interpreter_email",
    "pdfFieldName": "form1[0].#subform[1].Pt3Line6_EmailAddress[0]",
    "page": 1,
    "kind": "text"
  },
  {
    "key": "interpreter.interpreter_name",
    "pdfFieldName": "form1[0].#subform[1].Pt3Line1_InterpreterGivenName[0]",
    "page": 1,
    "kind": "text",
    "slot": "name_given"
  },
  {
    "key": "interpreter.interpreter_name",
    "pdfFieldName": "form1[0].#subform[1].Pt3Line1_InterpreterFamilyName[0]",
    "page": 1,
    "kind": "text",
    "slot": "name_family"
  },
  {
    "key": "interpreter.interpreter_organization",
    "pdfFieldName": "form1[0].#subform[1].Pt3Line2_NameofBusinessorOrgName[0]",
    "page": 1,
    "kind": "text"
  },
  {
    "key": "interpreter.interpreter_phone",
    "pdfFieldName": "form1[0].#subform[1].Pt3Line5_MobilePhone[0]",
    "page": 1,
    "kind": "text",
    "slot": "phone_mobile"
  },
  {
    "key": "interpreter.interpreter_phone",
    "pdfFieldName": "form1[0].#subform[1].Pt3Line4_DaytimePhone[0]",
    "page": 1,
    "kind": "text",
    "slot": "phone_day"
  },
  {
    "key": "applicant_contact.id_document_number",
    "pdfFieldName": "form1[0].#subform[2].Pt5Line2_IDNumber[0]",
    "page": 2,
    "kind": "text"
  },
  {
    "key": "applicant_contact.id_document_type",
    "pdfFieldName": "form1[0].#subform[2].Pt5Line1_ApplicantFormOfID[0]",
    "page": 2,
    "kind": "text"
  },
  {
    "key": "interpreter.interpreter_signature_date",
    "pdfFieldName": "form1[0].#subform[2].Pt3Line7_DateofSignature[0]",
    "page": 2,
    "kind": "text",
    "format": "date"
  },
  {
    "key": "preparer.preparer_email",
    "pdfFieldName": "form1[0].#subform[2].Pt4Line5_EmailAddress[0]",
    "page": 2,
    "kind": "text"
  },
  {
    "key": "preparer.preparer_name",
    "pdfFieldName": "form1[0].#subform[2].Pt4Line1_PreparerGivenName[0]",
    "page": 2,
    "kind": "text",
    "slot": "name_given"
  },
  {
    "key": "preparer.preparer_name",
    "pdfFieldName": "form1[0].#subform[2].Pt4Line1_PreparerFamilyName[0]",
    "page": 2,
    "kind": "text",
    "slot": "name_family"
  },
  {
    "key": "preparer.preparer_organization",
    "pdfFieldName": "form1[0].#subform[2].Pt4Line2_PreparerNameofBusinessorOrgName[0]",
    "page": 2,
    "kind": "text"
  },
  {
    "key": "preparer.preparer_phone",
    "pdfFieldName": "form1[0].#subform[2].Pt4Line4_MobilePhone[0]",
    "page": 2,
    "kind": "text",
    "slot": "phone_mobile"
  },
  {
    "key": "preparer.preparer_phone",
    "pdfFieldName": "form1[0].#subform[2].Pt4Line3_DaytimePhone[0]",
    "page": 2,
    "kind": "text",
    "slot": "phone_day"
  },
  {
    "key": "preparer.preparer_signature_date",
    "pdfFieldName": "form1[0].#subform[2].Pt4Line8_DateofSignature[0]",
    "page": 2,
    "kind": "text",
    "format": "date"
  },
  {
    "key": "civil_surgeon.apt",
    "pdfFieldName": "form1[0].#subform[3].Pt7Line3_AptSteFlrNumber[0]",
    "page": 3,
    "kind": "text"
  },
  {
    "key": "civil_surgeon.apt",
    "pdfFieldName": "form1[0].#subform[3].Pt7Line4_AptSteFlrNumber[0]",
    "page": 3,
    "kind": "text"
  },
  {
    "key": "civil_surgeon.city",
    "pdfFieldName": "form1[0].#subform[3].Pt7Line3_CityOrTown[0]",
    "page": 3,
    "kind": "text"
  },
  {
    "key": "civil_surgeon.city",
    "pdfFieldName": "form1[0].#subform[3].Pt7Line4_CityOrTown[0]",
    "page": 3,
    "kind": "text"
  },
  {
    "key": "civil_surgeon.date_signed",
    "pdfFieldName": "form1[0].#subform[3].Pt6Line2_DateoExam[0]",
    "page": 3,
    "kind": "text",
    "format": "date"
  },
  {
    "key": "civil_surgeon.email",
    "pdfFieldName": "form1[0].#subform[3].Pt7Line7_EmailAddress[0]",
    "page": 3,
    "kind": "text"
  },
  {
    "key": "civil_surgeon.medical_license",
    "pdfFieldName": "form1[0].#subform[3].Pt7Line1_CivilSurgeonID[0]",
    "page": 3,
    "kind": "text"
  },
  {
    "key": "civil_surgeon.phone",
    "pdfFieldName": "form1[0].#subform[3].Pt7Line6_MobilePhone[0]",
    "page": 3,
    "kind": "text",
    "slot": "phone_mobile"
  },
  {
    "key": "civil_surgeon.phone",
    "pdfFieldName": "form1[0].#subform[3].Pt7Line5_DaytimePhone[0]",
    "page": 3,
    "kind": "text"
  },
  {
    "key": "civil_surgeon.practice_name",
    "pdfFieldName": "form1[0].#subform[3].Pt7Line2_MedPracticeName[0]",
    "page": 3,
    "kind": "text"
  },
  {
    "key": "civil_surgeon.state",
    "pdfFieldName": "form1[0].#subform[3].Pt7Line3_State[0]",
    "page": 3,
    "kind": "text"
  },
  {
    "key": "civil_surgeon.state",
    "pdfFieldName": "form1[0].#subform[3].Pt7Line4_State[0]",
    "page": 3,
    "kind": "text"
  },
  {
    "key": "civil_surgeon.street",
    "pdfFieldName": "form1[0].#subform[3].Pt7Line3_StreetNumberName[0]",
    "page": 3,
    "kind": "text"
  },
  {
    "key": "civil_surgeon.street",
    "pdfFieldName": "form1[0].#subform[3].Pt7Line4_StreetNumberName[0]",
    "page": 3,
    "kind": "text"
  },
  {
    "key": "civil_surgeon.summary_overall",
    "pdfFieldName": "form1[0].#subform[3].Pt6Line1_OverallFinding[0]",
    "page": 3,
    "kind": "mark",
    "when": "none"
  },
  {
    "key": "civil_surgeon.summary_overall",
    "pdfFieldName": "form1[0].#subform[3].Pt6Line1_OverallFinding[1]",
    "page": 3,
    "kind": "mark",
    "when": "class_b"
  },
  {
    "key": "civil_surgeon.summary_overall",
    "pdfFieldName": "form1[0].#subform[3].Pt6Line1_OverallFinding[2]",
    "page": 3,
    "kind": "mark",
    "when": "class_a"
  },
  {
    "key": "civil_surgeon.surgeon_name",
    "pdfFieldName": "form1[0].#subform[3].Pt7Line1_GivenName[0]",
    "page": 3,
    "kind": "text",
    "slot": "name_given"
  },
  {
    "key": "civil_surgeon.surgeon_name",
    "pdfFieldName": "form1[0].#subform[3].Pt7Line1_FamilyName[0]",
    "page": 3,
    "kind": "text",
    "slot": "name_family"
  },
  {
    "key": "civil_surgeon.zip",
    "pdfFieldName": "form1[0].#subform[3].Pt7Line3_ZipCode[0]",
    "page": 3,
    "kind": "text"
  },
  {
    "key": "civil_surgeon.zip",
    "pdfFieldName": "form1[0].#subform[3].Pt7Line4_ZipCode[0]",
    "page": 3,
    "kind": "text"
  },
  {
    "key": "syphilis_sti.nonreactive_date_reported",
    "pdfFieldName": "form1[0].#subform[6].Pt8Line1B1c_DateNontreponemalTest[0]",
    "page": 6,
    "kind": "text",
    "format": "date"
  },
  {
    "key": "syphilis_sti.screening_titer",
    "pdfFieldName": "form1[0].#subform[6].Pt7Line1B1c_TiterOne[0]",
    "page": 6,
    "kind": "text"
  },
  {
    "key": "syphilis_sti.syphilis_date",
    "pdfFieldName": "form1[0].#subform[6].Pt8Line1B1b_DateNontrepoemaltest[0]",
    "page": 6,
    "kind": "text",
    "format": "date"
  },
  {
    "key": "syphilis_sti.syphilis_result",
    "pdfFieldName": "form1[0].#subform[6].Pt8Line1B1c_SyphilisScreen[0]",
    "page": 6,
    "kind": "mark",
    "when": "b"
  },
  {
    "key": "syphilis_sti.syphilis_result",
    "pdfFieldName": "form1[0].#subform[6].Pt8Line1B1c_SyphilisScreen[1]",
    "page": 6,
    "kind": "mark",
    "when": "a"
  },
  {
    "key": "syphilis_sti.syphilis_test_type",
    "pdfFieldName": "form1[0].#subform[6].Pt8Line1B1a_name[0]",
    "page": 6,
    "kind": "text"
  },
  {
    "key": "tb_screening.classification",
    "pdfFieldName": "form1[0].#subform[6].Pt8Line1A6_TBClassification[0]",
    "page": 6,
    "kind": "mark",
    "when": "NOClassA"
  },
  {
    "key": "tb_screening.classification",
    "pdfFieldName": "form1[0].#subform[6].Pt8Line1A6_TBClassification[1]",
    "page": 6,
    "kind": "mark",
    "when": "CA"
  },
  {
    "key": "tb_screening.classification",
    "pdfFieldName": "form1[0].#subform[6].Pt8Line1A6_TBClassification[2]",
    "page": 6,
    "kind": "mark",
    "when": "B1Pul"
  },
  {
    "key": "tb_screening.classification",
    "pdfFieldName": "form1[0].#subform[6].Pt8Line1A6_TBClassification[3]",
    "page": 6,
    "kind": "mark",
    "when": "B0"
  },
  {
    "key": "tb_screening.classification",
    "pdfFieldName": "form1[0].#subform[6].Pt8Line1A6_TBClassification[4]",
    "page": 6,
    "kind": "mark",
    "when": "B1Extrapul"
  },
  {
    "key": "tb_screening.classification",
    "pdfFieldName": "form1[0].#subform[6].Pt8Line1A6_TBClassification[5]",
    "page": 6,
    "kind": "mark",
    "when": "B2 TB Latent"
  },
  {
    "key": "tb_screening.classification",
    "pdfFieldName": "form1[0].#subform[6].Pt8Line1A6_TBClassification[6]",
    "page": 6,
    "kind": "mark",
    "when": "Class B Other Chest"
  },
  {
    "key": "vaccination_grid",
    "pdfFieldName": "form1[0].P13[0].sfTable[0].P9_TDVaccineCheckBox[0]",
    "page": 11,
    "kind": "mark"
  },
  {
    "key": "vaccination_grid",
    "pdfFieldName": "form1[0].P13[0].sfTable[0].Pt10Line13_CompleteSeries[0]",
    "page": 11,
    "kind": "text"
  },
  {
    "key": "vaccination_grid",
    "pdfFieldName": "form1[0].P13[0].sfTable[0].Pt10Line13_NotAge12[0]",
    "page": 11,
    "kind": "mark"
  },
  {
    "key": "vaccination_grid",
    "pdfFieldName": "form1[0].P13[0].sfTable[0].Pt10Line13_InsufficientCheckBox12[0]",
    "page": 11,
    "kind": "mark"
  },
  {
    "key": "vaccination_grid",
    "pdfFieldName": "form1[0].P13[0].sfTable[0].Pt10Line13_ContraCheckBox12[0]",
    "page": 11,
    "kind": "mark"
  },
  {
    "key": "vaccination_grid",
    "pdfFieldName": "form1[0].P13[0].sfTable[0].Pt10Line13d_DateReceived_4[0]",
    "page": 11,
    "kind": "text"
  },
  {
    "key": "vaccination_grid",
    "pdfFieldName": "form1[0].P13[0].sfTable[0].Pt10Line13_DateGiven_1[0]",
    "page": 11,
    "kind": "text"
  },
  {
    "key": "vaccination_grid",
    "pdfFieldName": "form1[0].P13[0].sfTable[0].Pt10Line13c_DateReceived_3[0]",
    "page": 11,
    "kind": "text"
  },
  {
    "key": "vaccination_grid",
    "pdfFieldName": "form1[0].P13[0].sfTable[0].Pt10Line13b_DateReceived_2[0]",
    "page": 11,
    "kind": "text"
  },
  {
    "key": "vaccination_grid",
    "pdfFieldName": "form1[0].P13[0].sfTable[0].Pt10Line13a_DateReceived_1[0]",
    "page": 11,
    "kind": "text"
  },
  {
    "key": "vaccination_grid",
    "pdfFieldName": "form1[0].P13[0].sfTable[0].Pt10_PVVaccineCheckBox[0]",
    "page": 11,
    "kind": "mark"
  },
  {
    "key": "vaccination_grid",
    "pdfFieldName": "form1[0].P13[0].sfTable[0].Pt10_PVVaccineCheckBox[1]",
    "page": 11,
    "kind": "mark"
  },
  {
    "key": "vaccination_grid",
    "pdfFieldName": "form1[0].P13[0].sfTable[0].P10_TDVaccineCheckBox[0]",
    "page": 11,
    "kind": "mark"
  },
  {
    "key": "vaccination_grid",
    "pdfFieldName": "form1[0].P13[0].sfTable[0].Pt10Line1_DTDateReceived1[0]",
    "page": 11,
    "kind": "text"
  },
  {
    "key": "vaccination_grid",
    "pdfFieldName": "form1[0].P13[0].sfTable[0].Pt10Line2_TdDateReceived1[0]",
    "page": 11,
    "kind": "text"
  },
  {
    "key": "vaccination_grid",
    "pdfFieldName": "form1[0].P13[0].sfTable[0].Pt10Line3a_DateReceived_1[0]",
    "page": 11,
    "kind": "text"
  },
  {
    "key": "vaccination_grid",
    "pdfFieldName": "form1[0].P13[0].sfTable[0].Pt10Line4a_DateReceived_1[0]",
    "page": 11,
    "kind": "text"
  },
  {
    "key": "vaccination_grid",
    "pdfFieldName": "form1[0].P13[0].sfTable[0].Pt10Line5a_DateReceived_1[0]",
    "page": 11,
    "kind": "text"
  },
  {
    "key": "vaccination_grid",
    "pdfFieldName": "form1[0].P13[0].sfTable[0].Pt10Line6_HBDateReceived1[0]",
    "page": 11,
    "kind": "text"
  },
  {
    "key": "vaccination_grid",
    "pdfFieldName": "form1[0].P13[0].sfTable[0].Pt10Line7a_DateReceived_1[0]",
    "page": 11,
    "kind": "text"
  },
  {
    "key": "vaccination_grid",
    "pdfFieldName": "form1[0].P13[0].sfTable[0].Pt10Line8a_DateReceived_1[0]",
    "page": 11,
    "kind": "text"
  },
  {
    "key": "vaccination_grid",
    "pdfFieldName": "form1[0].P13[0].sfTable[0].Pt10Line9a_DateReceived_1[0]",
    "page": 11,
    "kind": "text"
  },
  {
    "key": "vaccination_grid",
    "pdfFieldName": "form1[0].P13[0].sfTable[0].Pt10Line10a_DateReceived_1[0]",
    "page": 11,
    "kind": "text"
  },
  {
    "key": "vaccination_grid",
    "pdfFieldName": "form1[0].P13[0].sfTable[0].Pt10Line11a_DateReceived_1[0]",
    "page": 11,
    "kind": "text"
  },
  {
    "key": "vaccination_grid",
    "pdfFieldName": "form1[0].P13[0].sfTable[0].Pt10Line12a_DateReceived_1[0]",
    "page": 11,
    "kind": "text"
  },
  {
    "key": "vaccination_grid",
    "pdfFieldName": "form1[0].P13[0].sfTable[0].Pt10Line1_DTDateReceived2[0]",
    "page": 11,
    "kind": "text"
  },
  {
    "key": "vaccination_grid",
    "pdfFieldName": "form1[0].P13[0].sfTable[0].Pt10Line2_TdDateReceived2[0]",
    "page": 11,
    "kind": "text"
  },
  {
    "key": "vaccination_grid",
    "pdfFieldName": "form1[0].P13[0].sfTable[0].Pt10Line3b_DateReceived_2[0]",
    "page": 11,
    "kind": "text"
  },
  {
    "key": "vaccination_grid",
    "pdfFieldName": "form1[0].P13[0].sfTable[0].Pt10Line4b_DateReceived_2[0]",
    "page": 11,
    "kind": "text"
  },
  {
    "key": "vaccination_grid",
    "pdfFieldName": "form1[0].P13[0].sfTable[0].Pt10Line5b_DateReceived_2[0]",
    "page": 11,
    "kind": "text"
  },
  {
    "key": "vaccination_grid",
    "pdfFieldName": "form1[0].P13[0].sfTable[0].Pt10Line6_HBDateReceived2[0]",
    "page": 11,
    "kind": "text"
  },
  {
    "key": "vaccination_grid",
    "pdfFieldName": "form1[0].P13[0].sfTable[0].Pt10Line7b_DateReceived_2[0]",
    "page": 11,
    "kind": "text"
  },
  {
    "key": "vaccination_grid",
    "pdfFieldName": "form1[0].P13[0].sfTable[0].Pt10Line8b_DateReceived_2[0]",
    "page": 11,
    "kind": "text"
  },
  {
    "key": "vaccination_grid",
    "pdfFieldName": "form1[0].P13[0].sfTable[0].Pt10Line9b_DateReceived_2[0]",
    "page": 11,
    "kind": "text"
  },
  {
    "key": "vaccination_grid",
    "pdfFieldName": "form1[0].P13[0].sfTable[0].Pt10Line10b_DateReceived_2[0]",
    "page": 11,
    "kind": "text"
  },
  {
    "key": "vaccination_grid",
    "pdfFieldName": "form1[0].P13[0].sfTable[0].Pt10Line11b_DateReceived_2[0]",
    "page": 11,
    "kind": "text"
  },
  {
    "key": "vaccination_grid",
    "pdfFieldName": "form1[0].P13[0].sfTable[0].Pt10Line12b_DateReceived_2[0]",
    "page": 11,
    "kind": "text"
  },
  {
    "key": "vaccination_grid",
    "pdfFieldName": "form1[0].P13[0].sfTable[0].Pt10Line1_DTDateReceived3[0]",
    "page": 11,
    "kind": "text"
  },
  {
    "key": "vaccination_grid",
    "pdfFieldName": "form1[0].P13[0].sfTable[0].Pt10Line2_TdDateReceived3[0]",
    "page": 11,
    "kind": "text"
  },
  {
    "key": "vaccination_grid",
    "pdfFieldName": "form1[0].P13[0].sfTable[0].Pt10Line3c_DateReceived_3[0]",
    "page": 11,
    "kind": "text"
  },
  {
    "key": "vaccination_grid",
    "pdfFieldName": "form1[0].P13[0].sfTable[0].Pt10Line4c_DateReceived_3[0]",
    "page": 11,
    "kind": "text"
  },
  {
    "key": "vaccination_grid",
    "pdfFieldName": "form1[0].P13[0].sfTable[0].Pt10Line5c_DateReceived_3[0]",
    "page": 11,
    "kind": "text"
  },
  {
    "key": "vaccination_grid",
    "pdfFieldName": "form1[0].P13[0].sfTable[0].Pt10Line6_HBDateReceived3[0]",
    "page": 11,
    "kind": "text"
  },
  {
    "key": "vaccination_grid",
    "pdfFieldName": "form1[0].P13[0].sfTable[0].Pt10Line7c_DateReceived_3[0]",
    "page": 11,
    "kind": "text"
  },
  {
    "key": "vaccination_grid",
    "pdfFieldName": "form1[0].P13[0].sfTable[0].Pt10Line8c_DateReceived_3[0]",
    "page": 11,
    "kind": "text"
  },
  {
    "key": "vaccination_grid",
    "pdfFieldName": "form1[0].P13[0].sfTable[0].Pt10Line9c_DateReceived_3[0]",
    "page": 11,
    "kind": "text"
  },
  {
    "key": "vaccination_grid",
    "pdfFieldName": "form1[0].P13[0].sfTable[0].Pt10Line10c_DateReceived_3[0]",
    "page": 11,
    "kind": "text"
  },
  {
    "key": "vaccination_grid",
    "pdfFieldName": "form1[0].P13[0].sfTable[0].Pt10Line11c_DateReceived_3[0]",
    "page": 11,
    "kind": "text"
  },
  {
    "key": "vaccination_grid",
    "pdfFieldName": "form1[0].P13[0].sfTable[0].Pt10Line12c_DateReceived_3[0]",
    "page": 11,
    "kind": "text"
  },
  {
    "key": "vaccination_grid",
    "pdfFieldName": "form1[0].P13[0].sfTable[0].Pt10Line1_DTDateReceived4[0]",
    "page": 11,
    "kind": "text"
  },
  {
    "key": "vaccination_grid",
    "pdfFieldName": "form1[0].P13[0].sfTable[0].Pt10Line1_DTDateGiven[0]",
    "page": 11,
    "kind": "text"
  },
  {
    "key": "vaccination_grid",
    "pdfFieldName": "form1[0].P13[0].sfTable[0].Pt10Line2_TdDateGiven[0]",
    "page": 11,
    "kind": "text"
  },
  {
    "key": "vaccination_grid",
    "pdfFieldName": "form1[0].P13[0].sfTable[0].Pt10Line3_DateGiven_1[0]",
    "page": 11,
    "kind": "text"
  },
  {
    "key": "vaccination_grid",
    "pdfFieldName": "form1[0].P13[0].sfTable[0].Pt10Line4_DateGiven_1[0]",
    "page": 11,
    "kind": "text"
  },
  {
    "key": "vaccination_grid",
    "pdfFieldName": "form1[0].P13[0].sfTable[0].Pt10Line5_DateGiven_1[0]",
    "page": 11,
    "kind": "text"
  },
  {
    "key": "vaccination_grid",
    "pdfFieldName": "form1[0].P13[0].sfTable[0].Pt10Line6_HBDateGiven[0]",
    "page": 11,
    "kind": "text"
  },
  {
    "key": "vaccination_grid",
    "pdfFieldName": "form1[0].P13[0].sfTable[0].Pt10Line7_DateGiven_1[0]",
    "page": 11,
    "kind": "text"
  },
  {
    "key": "vaccination_grid",
    "pdfFieldName": "form1[0].P13[0].sfTable[0].Pt10Line8_DateGiven_1[0]",
    "page": 11,
    "kind": "text"
  },
  {
    "key": "vaccination_grid",
    "pdfFieldName": "form1[0].P13[0].sfTable[0].Pt10Line9_DateGiven_1[0]",
    "page": 11,
    "kind": "text"
  },
  {
    "key": "vaccination_grid",
    "pdfFieldName": "form1[0].P13[0].sfTable[0].Pt10Line10_DateGiven_1[0]",
    "page": 11,
    "kind": "text"
  },
  {
    "key": "vaccination_grid",
    "pdfFieldName": "form1[0].P13[0].sfTable[0].Pt10Line11_DateGiven_1[0]",
    "page": 11,
    "kind": "text"
  },
  {
    "key": "vaccination_grid",
    "pdfFieldName": "form1[0].P13[0].sfTable[0].Pt10Line12_DateGiven_1[0]",
    "page": 11,
    "kind": "text"
  },
  {
    "key": "vaccination_grid",
    "pdfFieldName": "form1[0].P13[0].sfTable[0].Pt10Line2_TdDateReceived4[0]",
    "page": 11,
    "kind": "text"
  },
  {
    "key": "vaccination_grid",
    "pdfFieldName": "form1[0].P13[0].sfTable[0].Pt10Line3d_DateReceived_4[0]",
    "page": 11,
    "kind": "text"
  },
  {
    "key": "vaccination_grid",
    "pdfFieldName": "form1[0].P13[0].sfTable[0].Pt10Line4d_DateReceived_4[0]",
    "page": 11,
    "kind": "text"
  },
  {
    "key": "vaccination_grid",
    "pdfFieldName": "form1[0].P13[0].sfTable[0].Pt10Line5d_DateReceived_4[0]",
    "page": 11,
    "kind": "text"
  },
  {
    "key": "vaccination_grid",
    "pdfFieldName": "form1[0].P13[0].sfTable[0].Pt10Line6_HBDateReceived4[0]",
    "page": 11,
    "kind": "text"
  },
  {
    "key": "vaccination_grid",
    "pdfFieldName": "form1[0].P13[0].sfTable[0].Pt10Line7d_DateReceived_4[0]",
    "page": 11,
    "kind": "text"
  },
  {
    "key": "vaccination_grid",
    "pdfFieldName": "form1[0].P13[0].sfTable[0].Pt10Line8d_DateReceived_4[0]",
    "page": 11,
    "kind": "text"
  },
  {
    "key": "vaccination_grid",
    "pdfFieldName": "form1[0].P13[0].sfTable[0].Pt10Line9d_DateReceived_4[0]",
    "page": 11,
    "kind": "text"
  },
  {
    "key": "vaccination_grid",
    "pdfFieldName": "form1[0].P13[0].sfTable[0].Pt10Line10d_DateReceived_4[0]",
    "page": 11,
    "kind": "text"
  },
  {
    "key": "vaccination_grid",
    "pdfFieldName": "form1[0].P13[0].sfTable[0].Pt10Line11d_DateReceived_4[0]",
    "page": 11,
    "kind": "text"
  },
  {
    "key": "vaccination_grid",
    "pdfFieldName": "form1[0].P13[0].sfTable[0].Pt10Line12d_DateReceived_4[0]",
    "page": 11,
    "kind": "text"
  },
  {
    "key": "vaccination_grid",
    "pdfFieldName": "form1[0].P13[0].sfTable[0].Pt10Line1_NotAge1[0]",
    "page": 11,
    "kind": "mark"
  },
  {
    "key": "vaccination_grid",
    "pdfFieldName": "form1[0].P13[0].sfTable[0].Pt10Line1_ContraCheckBox1[0]",
    "page": 11,
    "kind": "mark"
  },
  {
    "key": "vaccination_grid",
    "pdfFieldName": "form1[0].P13[0].sfTable[0].Pt10Line2_TdContra[0]",
    "page": 11,
    "kind": "mark"
  },
  {
    "key": "vaccination_grid",
    "pdfFieldName": "form1[0].P13[0].sfTable[0].Pt10Line3_ContraCheckBox3[0]",
    "page": 11,
    "kind": "mark"
  },
  {
    "key": "vaccination_grid",
    "pdfFieldName": "form1[0].P13[0].sfTable[0].Pt10Line4_ContraCheckBox4[0]",
    "page": 11,
    "kind": "mark"
  },
  {
    "key": "vaccination_grid",
    "pdfFieldName": "form1[0].P13[0].sfTable[0].Pt10Line5_ContraCheckBox5[0]",
    "page": 11,
    "kind": "mark"
  },
  {
    "key": "vaccination_grid",
    "pdfFieldName": "form1[0].P13[0].sfTable[0].Pt10Line6_ContraCheckBox6[0]",
    "page": 11,
    "kind": "mark"
  },
  {
    "key": "vaccination_grid",
    "pdfFieldName": "form1[0].P13[0].sfTable[0].Pt10Line7_ContraCheckBox7[0]",
    "page": 11,
    "kind": "mark"
  },
  {
    "key": "vaccination_grid",
    "pdfFieldName": "form1[0].P13[0].sfTable[0].Pt10Line8_ContraCheckBox8[0]",
    "page": 11,
    "kind": "mark"
  },
  {
    "key": "vaccination_grid",
    "pdfFieldName": "form1[0].P13[0].sfTable[0].Pt10Line9_ContraCheckBox9[0]",
    "page": 11,
    "kind": "mark"
  },
  {
    "key": "vaccination_grid",
    "pdfFieldName": "form1[0].P13[0].sfTable[0].Pt10Line10_ContraCheckBox10[0]",
    "page": 11,
    "kind": "mark"
  },
  {
    "key": "vaccination_grid",
    "pdfFieldName": "form1[0].P13[0].sfTable[0].Pt10Line11_ContraCheckBox11[0]",
    "page": 11,
    "kind": "mark"
  },
  {
    "key": "vaccination_grid",
    "pdfFieldName": "form1[0].P13[0].sfTable[0].Pt10Line12_ContraCheckBox12[0]",
    "page": 11,
    "kind": "mark"
  },
  {
    "key": "vaccination_grid",
    "pdfFieldName": "form1[0].P13[0].sfTable[0].Pt10Line1_InsufficientCheckBox1[0]",
    "page": 11,
    "kind": "mark"
  },
  {
    "key": "vaccination_grid",
    "pdfFieldName": "form1[0].P13[0].sfTable[0].Pt10Line2_InsufficientCheckBox2[0]",
    "page": 11,
    "kind": "mark"
  },
  {
    "key": "vaccination_grid",
    "pdfFieldName": "form1[0].P13[0].sfTable[0].Pt10Line3_InsufficientCheckBox3[0]",
    "page": 11,
    "kind": "mark"
  },
  {
    "key": "vaccination_grid",
    "pdfFieldName": "form1[0].P13[0].sfTable[0].Pt10Line4_InsufficientCheckBox4[0]",
    "page": 11,
    "kind": "mark"
  },
  {
    "key": "vaccination_grid",
    "pdfFieldName": "form1[0].P13[0].sfTable[0].Pt10Line5_InsufficientCheckBox5[0]",
    "page": 11,
    "kind": "mark"
  },
  {
    "key": "vaccination_grid",
    "pdfFieldName": "form1[0].P13[0].sfTable[0].Pt10Line6_InsufficientCheckBox6[0]",
    "page": 11,
    "kind": "mark"
  },
  {
    "key": "vaccination_grid",
    "pdfFieldName": "form1[0].P13[0].sfTable[0].Pt10Line7_InsufficientCheckBox7[0]",
    "page": 11,
    "kind": "mark"
  },
  {
    "key": "vaccination_grid",
    "pdfFieldName": "form1[0].P13[0].sfTable[0].Pt10Line8_InsufficientCheckBox8[0]",
    "page": 11,
    "kind": "mark"
  },
  {
    "key": "vaccination_grid",
    "pdfFieldName": "form1[0].P13[0].sfTable[0].Pt10Line10_InsufficientCheckBox9[0]",
    "page": 11,
    "kind": "mark"
  },
  {
    "key": "vaccination_grid",
    "pdfFieldName": "form1[0].P13[0].sfTable[0].Pt10Line10_InsufficientCheckBox10[0]",
    "page": 11,
    "kind": "mark"
  },
  {
    "key": "vaccination_grid",
    "pdfFieldName": "form1[0].P13[0].sfTable[0].Pt10Line11_InsufficientCheckBox11[0]",
    "page": 11,
    "kind": "mark"
  },
  {
    "key": "vaccination_grid",
    "pdfFieldName": "form1[0].P13[0].sfTable[0].Pt10Line12_InsufficientCheckBox12[0]",
    "page": 11,
    "kind": "mark"
  },
  {
    "key": "vaccination_grid",
    "pdfFieldName": "form1[0].P13[0].sfTable[0].Pt10Line2_NotAge2[0]",
    "page": 11,
    "kind": "mark"
  },
  {
    "key": "vaccination_grid",
    "pdfFieldName": "form1[0].P13[0].sfTable[0].Pt10Line3_NotAge3[0]",
    "page": 11,
    "kind": "mark"
  },
  {
    "key": "vaccination_grid",
    "pdfFieldName": "form1[0].P13[0].sfTable[0].Pt10Line4_NotAge4[0]",
    "page": 11,
    "kind": "mark"
  },
  {
    "key": "vaccination_grid",
    "pdfFieldName": "form1[0].P13[0].sfTable[0].Pt10Line5_NotAge5[0]",
    "page": 11,
    "kind": "mark"
  },
  {
    "key": "vaccination_grid",
    "pdfFieldName": "form1[0].P13[0].sfTable[0].Pt10Line6_NotAge6[0]",
    "page": 11,
    "kind": "mark"
  },
  {
    "key": "vaccination_grid",
    "pdfFieldName": "form1[0].P13[0].sfTable[0].Pt10Line7_NotAge7[0]",
    "page": 11,
    "kind": "mark"
  },
  {
    "key": "vaccination_grid",
    "pdfFieldName": "form1[0].P13[0].sfTable[0].Pt10Line8_NotAge8[0]",
    "page": 11,
    "kind": "mark"
  },
  {
    "key": "vaccination_grid",
    "pdfFieldName": "form1[0].P13[0].sfTable[0].Pt10Line9_NotAge9[0]",
    "page": 11,
    "kind": "mark"
  },
  {
    "key": "vaccination_grid",
    "pdfFieldName": "form1[0].P13[0].sfTable[0].Pt10Line10_NotAge10[0]",
    "page": 11,
    "kind": "mark"
  },
  {
    "key": "vaccination_grid",
    "pdfFieldName": "form1[0].P13[0].sfTable[0].Pt10Line11_NotAge11[0]",
    "page": 11,
    "kind": "mark"
  },
  {
    "key": "vaccination_grid",
    "pdfFieldName": "form1[0].P13[0].sfTable[0].Pt10Line12_NotAge12[0]",
    "page": 11,
    "kind": "mark"
  },
  {
    "key": "vaccination_grid",
    "pdfFieldName": "form1[0].P13[0].sfTable[0].Pt10Line1_DTCompleteSeries[0]",
    "page": 11,
    "kind": "text"
  },
  {
    "key": "vaccination_grid",
    "pdfFieldName": "form1[0].P13[0].sfTable[0].Pt10Line2_TdCompleteSeries[0]",
    "page": 11,
    "kind": "text"
  },
  {
    "key": "vaccination_grid",
    "pdfFieldName": "form1[0].P13[0].sfTable[0].Pt10Line1_CompleteSeries[0]",
    "page": 11,
    "kind": "text"
  },
  {
    "key": "vaccination_grid",
    "pdfFieldName": "form1[0].P13[0].sfTable[0].Pt10Line1_CompleteSeries[1]",
    "page": 11,
    "kind": "text"
  },
  {
    "key": "vaccination_grid",
    "pdfFieldName": "form1[0].P13[0].sfTable[0].Pt10Line1_CompleteSeries[2]",
    "page": 11,
    "kind": "text"
  },
  {
    "key": "vaccination_grid",
    "pdfFieldName": "form1[0].P13[0].sfTable[0].Pt10Line1_HBCompleteSeries[0]",
    "page": 11,
    "kind": "text"
  },
  {
    "key": "vaccination_grid",
    "pdfFieldName": "form1[0].P13[0].sfTable[0].Pt10Line1_CompleteSeries[3]",
    "page": 11,
    "kind": "text"
  },
  {
    "key": "vaccination_grid",
    "pdfFieldName": "form1[0].P13[0].sfTable[0].Pt10Line1_CompleteSeries[4]",
    "page": 11,
    "kind": "text"
  },
  {
    "key": "vaccination_grid",
    "pdfFieldName": "form1[0].P13[0].sfTable[0].Pt10Line1_CompleteSeries[5]",
    "page": 11,
    "kind": "text"
  },
  {
    "key": "vaccination_grid",
    "pdfFieldName": "form1[0].P13[0].sfTable[0].Pt10Line1_CompleteSeries[6]",
    "page": 11,
    "kind": "text"
  },
  {
    "key": "vaccination_grid",
    "pdfFieldName": "form1[0].P13[0].sfTable[0].Pt10Line1_CompleteSeries[7]",
    "page": 11,
    "kind": "text"
  },
  {
    "key": "vaccination_grid",
    "pdfFieldName": "form1[0].P13[0].sfTable[0].Pt10Line9_InfluVaccineInsufficient9[0]",
    "page": 11,
    "kind": "mark"
  },
  {
    "key": "civil_surgeon.summary_remarks",
    "pdfFieldName": "form1[0].#subform[12].P10_USCIS_Remarks[0]",
    "page": 12,
    "kind": "text"
  },
  {
    "key": "civil_surgeon.vaccination_remarks",
    "pdfFieldName": "form1[0].#subform[12].P10_Remarks[0]",
    "page": 12,
    "kind": "text"
  },
  {
    "key": "civil_surgeon.vaccinations_complete",
    "pdfFieldName": "form1[0].#subform[12].P10_Results[0]",
    "page": 12,
    "kind": "mark",
    "when": "Yes"
  },
  {
    "key": "civil_surgeon.vaccinations_complete",
    "pdfFieldName": "form1[0].#subform[12].P10_Results[1]",
    "page": 12,
    "kind": "mark",
    "when": "No"
  }
]
