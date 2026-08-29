const mongoose = require("mongoose");

const normalizeEmail = (email) => String(email || '').trim().toLowerCase();

const userSchema = mongoose.Schema({
    fullName: {
        type: String,
        required: true,
    },
    email: {
        type: String,
        required: true,
        trim: true,
        lowercase: true,
    },
    emailNormalized: {
        type: String,
        trim: true,
        lowercase: true,
    },
    password: {
        type: String,
        required: true,
    },
    token: {
        type: String,
        default: null,
    },
    emailVerified: {
        type: Boolean,
        default: false,
    },
    emailVerifiedAt: {
        type: Date,
        default: null,
    },
    otpHash: {
        type: String,
        default: null,
    },
    otpExpiry: {
        type: Date,
        default: null,
    },
    otpAttempts: {
        type: Number,
        default: 0,
    },
    otpRequestedAt: {
        type: Date,
        default: null,
    },
    lastSeen: {
        type: Date,
        default: Date.now,
    },
    passwordResetAt: {
        type: Date,
        default: null,
    },
    avatar: {
        url: {
            type: String,
            default: null,
        },
        publicId: {
            type: String,
            default: null,
        },
    },
}, { timestamps: true });

userSchema.pre('validate', function normalizeUserEmail(next) {
    const normalized = normalizeEmail(this.email || this.emailNormalized);
    if (normalized) {
        this.email = normalized;
        this.emailNormalized = normalized;
    }
    next();
});

userSchema.index({ emailNormalized: 1 }, { unique: true, sparse: true, name: 'unique_normalized_email' });

const Users = mongoose.model('User', userSchema);

module.exports = Users;
module.exports.normalizeEmail = normalizeEmail;
