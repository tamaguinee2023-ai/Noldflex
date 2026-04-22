#!/usr/bin/env node
/**
 * setup-user.js
 * Script Firebase Admin SDK pour :
 *   1. Créer un utilisateur Firebase Auth
 *   2. Assigner les custom claims (companyId + role)
 *   3. Créer le profil dans Firestore /users/{uid}
 *
 * Usage :
 *   node scripts/setup-user.js \
 *     --email=admin@noldex.gn \
 *     --password=MotDePasse123 \
 *     --name="Ali Diallo" \
 *     --company=noldex \
 *     --role=admin
 *
 * Prérequis :
 *   npm install firebase-admin
 *   export GOOGLE_APPLICATION_CREDENTIALS=./serviceAccountKey.json
 *   (télécharger depuis Firebase Console → Project Settings → Service accounts)
 */

const admin = require("firebase-admin");

// ── Parse arguments CLI ──
const args = Object.fromEntries(
  process.argv.slice(2)
    .filter(a => a.startsWith("--"))
    .map(a => {
      const [k, ...v] = a.slice(2).split("=");
      return [k, v.join("=")];
    })
);

const VALID_ROLES = ["admin", "manager", "driver", "client", "partner"];

function usage() {
  console.log(`
Usage:
  node scripts/setup-user.js \\
    --email=admin@noldex.gn \\
    --password=MotDePasse123 \\
    --name="Ali Diallo" \\
    --company=noldex \\
    --role=admin

Roles disponibles: ${VALID_ROLES.join(", ")}
  `);
  process.exit(1);
}

if (!args.email || !args.password || !args.name || !args.company || !args.role) {
  console.error("❌ Arguments manquants.");
  usage();
}

if (!VALID_ROLES.includes(args.role)) {
  console.error(`❌ Role invalide: "${args.role}". Valeurs: ${VALID_ROLES.join(", ")}`);
  process.exit(1);
}

// ── Init Admin SDK ──
if (!admin.apps.length) {
  admin.initializeApp();
  // Utilise GOOGLE_APPLICATION_CREDENTIALS automatiquement
  // ou les credentials par défaut si sur GCP/Cloud Functions
}

const db = admin.firestore();

async function main() {
  const { email, password, name, company: companyId, role } = args;

  console.log(`\n🔧 Configuration utilisateur`);
  console.log(`   Email     : ${email}`);
  console.log(`   Nom       : ${name}`);
  console.log(`   Entreprise: ${companyId}`);
  console.log(`   Rôle      : ${role}\n`);

  // ── 1. Créer ou récupérer l'utilisateur Auth ──
  let uid;
  try {
    const existing = await admin.auth().getUserByEmail(email);
    uid = existing.uid;
    console.log(`ℹ️  Utilisateur existant — uid: ${uid}`);

    // Mettre à jour le mot de passe si fourni
    await admin.auth().updateUser(uid, {
      displayName: name,
      password,
    });
    console.log(`✓  Profil Auth mis à jour`);
  } catch (e) {
    if (e.code === "auth/user-not-found") {
      const newUser = await admin.auth().createUser({
        email,
        password,
        displayName: name,
        emailVerified: false,
      });
      uid = newUser.uid;
      console.log(`✓  Utilisateur Auth créé — uid: ${uid}`);
    } else {
      throw e;
    }
  }

  // ── 2. Assigner les Custom Claims JWT ──
  await admin.auth().setCustomUserClaims(uid, {
    companyId,
    role,
  });
  console.log(`✓  Custom claims assignés: { companyId: "${companyId}", role: "${role}" }`);

  // ── 3. Créer / mettre à jour le profil Firestore ──
  const userRef = db.collection("users").doc(uid);
  await userRef.set({
    uid,
    name,
    email,
    role,
    companyId,
    active:    true,
    twofa:     false,
    avatar:    "",
    createdAt: admin.firestore.FieldValue.serverTimestamp(),
    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
  }, { merge: true });
  console.log(`✓  Profil Firestore /users/${uid} créé/mis à jour`);

  // ── 4. S'assurer que le doc /companies/{companyId} existe ──
  const companyRef = db.collection("companies").doc(companyId);
  const companySnap = await companyRef.get();
  if (!companySnap.exists) {
    await companyRef.set({
      name:      companyId.charAt(0).toUpperCase() + companyId.slice(1),
      plan:      "starter",
      active:    true,
      country:   "Guinée",
      email:     email,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
    });
    console.log(`✓  Document /companies/${companyId} créé`);
  } else {
    console.log(`ℹ️  /companies/${companyId} existe déjà`);
  }

  console.log(`
✅ Utilisateur prêt !

   Email    : ${email}
   UID      : ${uid}
   Claims   : companyId="${companyId}", role="${role}"

⚠️  L'utilisateur doit se déconnecter et se reconnecter
   pour que les nouveaux custom claims soient pris en compte.
`);
}

main().catch(err => {
  console.error("❌ Erreur :", err.message);
  process.exit(1);
});
