"""Clinical urgency classifier.

A trained TF-IDF + Gradient Boosting model that predicts clinical urgency
from symptom descriptions. This adds a learned ML layer on top of the
regex-based guardrails, demonstrating traditional ML alongside LLM orchestration.

Urgency levels:
  0 = routine (schedule a regular appointment)
  1 = soon (see provider within 24-48 hours)
  2 = urgent (same-day care needed)
  3 = emergency (call 911 / go to ER immediately)

The model is trained on synthetic clinical vignettes covering women's health
scenarios. In production, this would be trained on de-identified EHR triage data.
"""

import os
from pathlib import Path

import joblib
import numpy as np
from sklearn.ensemble import GradientBoostingClassifier
from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.model_selection import cross_val_score
from sklearn.pipeline import Pipeline

MODEL_PATH = Path(__file__).parent / "urgency_model.joblib"

URGENCY_LABELS = {
    0: "routine",
    1: "soon",
    2: "urgent",
    3: "emergency",
}

# Training data: synthetic clinical vignettes for women's health triage
TRAINING_DATA: list[tuple[str, int]] = [
    # ── Emergency (3) ──
    ("severe headache blurred vision 34 weeks pregnant swollen face", 3),
    ("heavy vaginal bleeding soaking through pad every hour pregnant", 3),
    ("sudden severe abdominal pain one sided early pregnancy", 3),
    ("chest pain shortness of breath postpartum", 3),
    ("seizure during pregnancy convulsions", 3),
    ("baby not moving no fetal movement 30 weeks", 3),
    ("thoughts of harming myself or my baby postpartum", 3),
    ("water broke preterm 28 weeks gush of fluid", 3),
    ("high fever 104 degrees pregnant chills", 3),
    ("severe preeclampsia symptoms headache vision changes upper abdominal pain", 3),
    ("unconscious pregnant woman fainted not responding", 3),
    ("cord prolapse can feel umbilical cord", 3),
    ("massive hemorrhage after delivery cant stop bleeding", 3),
    ("eclamptic seizure pregnancy high blood pressure", 3),
    ("placental abruption sharp constant pain bleeding", 3),
    ("severe allergic reaction difficulty breathing pregnant", 3),
    ("suicidal thoughts want to end it all new mother", 3),
    ("stroke symptoms face drooping arm weakness pregnant", 3),
    ("amniotic fluid embolism sudden collapse delivery", 3),
    ("ruptured ectopic pregnancy severe pain dizziness", 3),

    # ── Urgent (2) ──
    ("regular contractions every 5 minutes 36 weeks", 2),
    ("blood pressure 150 over 95 pregnant headache", 2),
    ("decreased fetal movement baby moving less than usual", 2),
    ("painful urination fever flank pain pregnant UTI", 2),
    ("heavy bleeding between periods large clots soaking pads", 2),
    ("severe morning sickness cant keep anything down dehydrated", 2),
    ("swollen leg calf pain warmth pregnant possible DVT", 2),
    ("fever 102 pregnant body aches", 2),
    ("rupture of membranes term water broke contractions starting", 2),
    ("breast lump rapidly growing painful", 2),
    ("severe pelvic pain cant walk ovarian torsion", 2),
    ("mastitis high fever red breast breastfeeding", 2),
    ("postpartum bleeding increased heavier than period", 2),
    ("gestational diabetes blood sugar over 200", 2),
    ("premature contractions 32 weeks tightening", 2),
    ("severe itching all over body pregnant cholestasis", 2),
    ("sudden onset severe headache worst headache of life pregnant", 2),
    ("painful red swollen leg postpartum blood clot concern", 2),
    ("baby jaundice yellow skin not feeding well newborn", 2),
    ("panic attack cant breathe postpartum anxiety overwhelming", 2),

    # ── Soon (1) ──
    ("mild cramping spotting early pregnancy 6 weeks", 1),
    ("morning sickness nausea but keeping some food down", 1),
    ("mild headache during pregnancy occasional", 1),
    ("breast tenderness and engorgement breastfeeding", 1),
    ("mild yeast infection itching discharge pregnant", 1),
    ("constipation bloating during pregnancy uncomfortable", 1),
    ("back pain getting worse third trimester", 1),
    ("swollen ankles and feet 35 weeks no headache normal BP", 1),
    ("mood swings crying spells postpartum two weeks", 1),
    ("irregular periods for three months not pregnant", 1),
    ("hot flashes night sweats perimenopause affecting sleep", 1),
    ("round ligament pain sharp pain with movement second trimester", 1),
    ("hemorrhoids bleeding during pregnancy painful", 1),
    ("baby has mild diaper rash red skin", 1),
    ("gestational diabetes diet not controlling blood sugars well", 1),
    ("vaginal discharge changed color odor during pregnancy", 1),
    ("mild pelvic pressure 37 weeks baby dropping", 1),
    ("heartburn acid reflux severe during pregnancy", 1),
    ("insomnia during pregnancy cant sleep third trimester", 1),
    ("mild postpartum bleeding normal flow two weeks after delivery", 1),

    # ── Routine (0) ──
    ("when should I schedule my next prenatal visit", 0),
    ("what prenatal vitamins should I take", 0),
    ("how much weight should I gain during pregnancy", 0),
    ("is it safe to exercise during pregnancy walking", 0),
    ("when will I feel the baby move first time pregnant", 0),
    ("what foods should I avoid while pregnant", 0),
    ("how do I prepare for breastfeeding tips", 0),
    ("when should I start thinking about birth plan", 0),
    ("what is the glucose screening test like", 0),
    ("how often should I have prenatal checkups", 0),
    ("can I travel during second trimester flying", 0),
    ("what are normal pregnancy symptoms first trimester", 0),
    ("when should I stop working before due date", 0),
    ("what contraception options are available after delivery", 0),
    ("menopause questions hormone replacement therapy information", 0),
    ("trying to conceive how to track ovulation", 0),
    ("pap smear due when should I schedule cervical screening", 0),
    ("baby development milestones 3 months rolling over", 0),
    ("postpartum checkup six weeks what to expect", 0),
    ("fertility evaluation what tests will doctor order", 0),
    ("PCOS diagnosis what lifestyle changes should I make", 0),
    ("endometriosis management options long term", 0),
    ("IVF process what to expect timeline", 0),
    ("prenatal genetic screening options NIPT nuchal translucency", 0),
    ("breastfeeding positions and latch techniques help", 0),
]


def train_model() -> Pipeline:
    """Train the urgency classifier and save to disk."""
    texts = [t[0] for t in TRAINING_DATA]
    labels = [t[1] for t in TRAINING_DATA]

    pipeline = Pipeline([
        ("tfidf", TfidfVectorizer(
            max_features=500,
            ngram_range=(1, 2),
            stop_words="english",
            sublinear_tf=True,
        )),
        ("clf", GradientBoostingClassifier(
            n_estimators=100,
            max_depth=4,
            learning_rate=0.1,
            random_state=42,
        )),
    ])

    pipeline.fit(texts, labels)

    # Cross-validation score
    scores = cross_val_score(pipeline, texts, labels, cv=5, scoring="accuracy")
    print(f"  Urgency classifier trained: {len(texts)} samples, "
          f"CV accuracy: {scores.mean():.1%} (+/- {scores.std():.1%})")

    joblib.dump(pipeline, MODEL_PATH)
    return pipeline


def load_model() -> Pipeline:
    """Load the trained model, training if needed."""
    if MODEL_PATH.exists():
        return joblib.load(MODEL_PATH)
    return train_model()


# Module-level model instance
_model: Pipeline | None = None


def predict_urgency(text: str) -> dict:
    """Predict clinical urgency from symptom description.

    Returns:
        {
            "urgency_level": int (0-3),
            "urgency_label": str,
            "confidence": float (0-1),
            "probabilities": {label: float}
        }
    """
    global _model
    if _model is None:
        _model = load_model()

    probs = _model.predict_proba([text])[0]
    predicted_class = int(np.argmax(probs))
    confidence = float(probs[predicted_class])

    return {
        "urgency_level": predicted_class,
        "urgency_label": URGENCY_LABELS[predicted_class],
        "confidence": round(confidence, 3),
        "probabilities": {
            URGENCY_LABELS[i]: round(float(p), 3)
            for i, p in enumerate(probs)
        },
    }


if __name__ == "__main__":
    print("Training urgency classifier...")
    model = train_model()

    test_cases = [
        "severe headache blurred vision 34 weeks pregnant",
        "morning sickness nausea but keeping food down",
        "when should I schedule my prenatal visit",
        "contractions every 5 minutes 36 weeks",
        "what prenatal vitamins should I take",
        "heavy bleeding soaking through pads pregnant",
    ]

    print("\nTest predictions:")
    for text in test_cases:
        result = predict_urgency(text)
        print(f"  [{result['urgency_label']:>9} {result['confidence']:.0%}] {text[:60]}")
