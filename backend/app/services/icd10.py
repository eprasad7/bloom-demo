"""ICD-10 code mapping — extracts clinical codes from user symptoms.

Uses a lightweight keyword-based approach for the demo.
In production, this would call an NLP entity extraction service.
"""

# Common women's health symptom → ICD-10 mappings
SYMPTOM_CODE_MAP: list[tuple[list[str], str, str]] = [
    # (keywords, ICD-10 code, description)
    # Pregnancy
    (["preeclampsia", "pre-eclampsia", "toxemia"], "O14.9", "Pre-eclampsia, unspecified"),
    (["eclampsia"], "O15.9", "Eclampsia, unspecified as to time period"),
    (["gestational diabetes"], "O24.419", "Gestational diabetes mellitus in pregnancy, unspecified control"),
    (["morning sickness", "nausea", "vomiting", "hyperemesis"], "O21.0", "Mild hyperemesis gravidarum"),
    (["miscarriage", "pregnancy loss", "spontaneous abortion"], "O03.9", "Complete or unspecified spontaneous abortion without complication"),
    (["ectopic pregnancy"], "O00.90", "Unspecified ectopic pregnancy without intrauterine pregnancy"),
    (["preterm labor", "premature labor", "premature contractions"], "O60.00", "Preterm labor without delivery, unspecified trimester"),
    (["placenta previa"], "O44.00", "Complete placenta previa NOS, unspecified trimester"),
    (["postpartum hemorrhage", "heavy bleeding after birth"], "O72.1", "Other immediate postpartum hemorrhage"),
    (["gestational hypertension", "high blood pressure pregnant"], "O13.9", "Gestational hypertension, unspecified trimester"),
    (["group b strep", "gbs"], "O99.820", "Streptococcus B carrier state complicating pregnancy"),
    (["breech"], "O32.1XX0", "Maternal care for breech presentation"),
    (["blurred vision", "blurry vision", "seeing spots", "visual changes"], "H53.8", "Other visual disturbances"),
    (["swollen feet", "swollen ankles", "edema", "swelling"], "R60.0", "Localized edema"),
    (["severe headache"], "R51.9", "Headache, unspecified"),
    (["nausea", "nauseous"], "R11.0", "Nausea"),

    # Postpartum
    (["postpartum depression", "ppd"], "F53.0", "Postpartum depression"),
    (["postpartum psychosis"], "F53.1", "Puerperal psychosis"),
    (["mastitis", "breast infection"], "O91.10", "Abscess of breast associated with the puerperium"),
    (["breastfeeding difficulty", "lactation problem"], "O92.5", "Suppressed lactation"),

    # Fertility
    (["infertility", "can't get pregnant", "trouble conceiving"], "N97.9", "Female infertility, unspecified"),
    (["pcos", "polycystic ovary", "polycystic ovarian"], "E28.2", "Polycystic ovarian syndrome"),
    (["endometriosis"], "N80.0", "Endometriosis of uterus"),
    (["ovarian cyst"], "N83.20", "Unspecified ovarian cysts"),
    (["uterine fibroid", "fibroid"], "D25.9", "Leiomyoma of uterus, unspecified"),

    # Menopause
    (["menopause", "menopausal"], "N95.1", "Menopausal and female climacteric states"),
    (["hot flash", "hot flush", "vasomotor"], "N95.1", "Menopausal and female climacteric states"),
    (["vaginal dryness", "atrophic vaginitis"], "N95.2", "Postmenopausal atrophic vaginitis"),
    (["osteoporosis", "bone density"], "M81.0", "Age-related osteoporosis without current pathological fracture"),

    # General women's health
    (["irregular period", "irregular menstruation", "amenorrhea"], "N91.2", "Amenorrhea, unspecified"),
    (["heavy period", "menorrhagia", "heavy menstrual"], "N92.0", "Excessive and frequent menstruation with regular cycle"),
    (["painful period", "dysmenorrhea", "menstrual cramp"], "N94.6", "Dysmenorrhea, unspecified"),
    (["pelvic pain"], "R10.2", "Pelvic and perineal pain"),
    (["urinary incontinence", "bladder leak"], "N39.3", "Stress incontinence (female)"),
    (["cervical cancer", "abnormal pap", "hpv"], "R87.610", "Atypical squamous cells of undetermined significance on cytologic smear of cervix"),
    (["anxiety", "anxious"], "F41.9", "Anxiety disorder, unspecified"),
    (["depression", "depressed", "sad"], "F32.9", "Major depressive disorder, single episode, unspecified"),
    (["headache", "migraine"], "R51.9", "Headache, unspecified"),
    (["fatigue", "tired", "exhaustion"], "R53.83", "Other fatigue"),
    (["insomnia", "can't sleep", "sleep problem"], "G47.00", "Insomnia, unspecified"),
]


def lookup_icd10_codes(message: str, max_codes: int = 5) -> list[dict]:
    """Match user message to relevant ICD-10 codes.

    Returns list of {code, description, matched_terms} dicts.
    """
    message_lower = message.lower()
    matches: list[dict] = []
    seen_codes: set[str] = set()

    for keywords, code, description in SYMPTOM_CODE_MAP:
        if code in seen_codes:
            continue

        matched_terms = [kw for kw in keywords if kw in message_lower]
        if matched_terms:
            matches.append({
                "code": code,
                "description": description,
                "matched_terms": matched_terms,
            })
            seen_codes.add(code)

        if len(matches) >= max_codes:
            break

    return matches
