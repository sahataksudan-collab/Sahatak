// Medical Records API Integration - Following main.js patterns
const MedicalRecordsAPI = {
    // Get patient medical history
    async getPatientMedicalHistory(patientId = null) {
        try {
            const url = patientId ? `/medical-history/patient/${patientId}` : '/medical-history/check-completion';
            const response = await ApiHelper.makeRequest(url);
            
            if (response.success) {
                return {
                    success: true,
                    data: {
                        medicalHistory: response.data.patient_medical_history || response.data,
                        historyUpdates: response.data.recent_updates || [],
                        completed: response.data.history_completed || response.data.completed
                    }
                };
            } else {
                return { success: false, message: response.message };
            }
        } catch (error) {
            console.error('Error getting medical history:', error);
            return { success: false, message: 'Error loading medical history' };
        }
    },

    // Update patient medical history
    async updateMedicalHistory(medicalData, appointmentId = null) {
        try {
            const requestData = {
                ...medicalData
            };

            if (appointmentId) {
                requestData.appointment_id = appointmentId;
            }

            const response = await ApiHelper.makeRequest('/medical-history/update', {
                method: 'PUT',
                body: JSON.stringify(requestData)
            });

            if (response.success) {
                return {
                    success: true,
                    data: response.data.patient_medical_history,
                    message: 'Medical history updated successfully'
                };
            } else {
                return { success: false, message: response.message };
            }
        } catch (error) {
            console.error('Error updating medical history:', error);
            return { success: false, message: 'Error updating medical history' };
        }
    },

    // Complete medical history (for new patients)
    async completeMedicalHistory(medicalData) {
        try {
            const response = await ApiHelper.makeRequest('/medical-history/complete', {
                method: 'POST',
                body: JSON.stringify(medicalData)
            });

            if (response.success) {
                return {
                    success: true,
                    data: response.data.patient_medical_history,
                    message: 'Medical history completed successfully'
                };
            } else {
                return { success: false, message: response.message };
            }
        } catch (error) {
            console.error('Error completing medical history:', error);
            return { success: false, message: 'Error completing medical history' };
        }
    },

    // Get patient diagnoses (medical reports) — EHR endpoint, newest first.
    // NOTE: unlike the siblings above, this re-throws ApiError instead of
    // swallowing it: the Care Summary UI must classify offline/401/failure
    // (mirrors the mobile records API contract).
    async getPatientDiagnoses(patientUserId) {
        const response = await ApiHelper.makeRequest(`/ehr/diagnoses/patient/${patientUserId}`);
        if (response.success) {
            return { success: true, data: response.data.diagnoses || [] };
        }
        return { success: false, message: response.message };
    },

    // Get medical history updates (audit trail)

    async getMedicalHistoryUpdates(patientId, page = 1, perPage = 10) {
        try {
            const params = new URLSearchParams({
                page: page,
                per_page: perPage
            });

            const response = await ApiHelper.makeRequest(`/medical-history/updates/${patientId}?${params}`);

            if (response.success) {
                return {
                    success: true,
                    data: {
                        updates: response.data.updates || [],
                        pagination: response.meta?.pagination || {}
                    }
                };
            } else {
                return { success: false, message: response.message };
            }
        } catch (error) {
            console.error('Error getting history updates:', error);
            return { success: false, message: 'Error loading history updates' };
        }
    },

    // Get appointment history prompt
    async getAppointmentHistoryPrompt(appointmentId) {
        try {
            const response = await ApiHelper.makeRequest(`/medical-history/appointment-prompt/${appointmentId}`);

            if (response.success) {
                return {
                    success: true,
                    data: response.data
                };
            } else {
                return { success: false, message: response.message };
            }
        } catch (error) {
            console.error('Error getting appointment history prompt:', error);
            return { success: false, message: 'Error loading medical history reminder' };
        }
    }
};

// Additional Medical History API endpoints
const MedicalHistoryAPI = {
    // Get patient medical history
    async getPatientMedicalHistory(patientId) {
        try {
            const response = await ApiHelper.makeRequest(`/medical-history/patient/${patientId}`);
            
            if (response.success) {
                return {
                    success: true,
                    data: response.data
                };
            } else {
                console.error('Error fetching patient medical history:', response.message);
                return {
                    success: false,
                    error: response.message || 'Failed to load medical history'
                };
            }
        } catch (error) {
            console.error('Error fetching patient medical history:', error);
            return {
                success: false,
                error: 'Failed to load medical history'
            };
        }
    },

    // Check medical history completion status
    async checkMedicalHistoryCompletion() {
        try {
            const response = await ApiHelper.makeRequest('/medical-history/check-completion');
            
            if (response.success) {
                return {
                    success: true,
                    data: response.data
                };
            } else {
                console.error('Error checking medical history completion:', response.message);
                return {
                    success: false,
                    error: response.message || 'Failed to check completion status'
                };
            }
        } catch (error) {
            console.error('Error checking medical history completion:', error);
            return {
                success: false,
                error: 'Failed to check completion status'
            };
        }
    }
};

// Prescription Management API
const PrescriptionsAPI = {
    // Get prescriptions with optional filters
    async getPrescriptions(filters = {}) {
        try {
            const params = new URLSearchParams();
            
            if (filters.page) params.append('page', filters.page);
            if (filters.perPage) params.append('per_page', filters.perPage);
            if (filters.status) params.append('status', filters.status);

            const response = await ApiHelper.makeRequest(`/prescriptions/?${params}`);

            if (response.success) {
                return {
                    success: true,
                    data: {
                        prescriptions: response.data.prescriptions || [],
                        pagination: response.meta?.pagination || {}
                    }
                };
            } else {
                return { success: false, message: response.message };
            }
        } catch (error) {
            console.error('Error getting prescriptions:', error);
            return { success: false, message: 'Error loading prescriptions' };
        }
    },

    // Get specific prescription details
    async getPrescriptionDetails(prescriptionId) {
        try {
            const response = await ApiHelper.makeRequest(`/prescriptions/${prescriptionId}`);

            if (response.success) {
                return {
                    success: true,
                    data: response.data.prescription
                };
            } else {
                return { success: false, message: response.message };
            }
        } catch (error) {
            console.error('Error getting prescription details:', error);
            return { success: false, message: 'Error loading prescription details' };
        }
    },

    // Create new prescription (doctors only)
    async createPrescription(prescriptionData) {
        try {
            const response = await ApiHelper.makeRequest('/prescriptions/', {
                method: 'POST',
                body: JSON.stringify(prescriptionData)
            });

            if (response.success) {
                return {
                    success: true,
                    data: response.data.prescription,
                    message: 'Prescription created successfully'
                };
            } else {
                return { success: false, message: response.message };
            }
        } catch (error) {
            console.error('Error creating prescription:', error);
            return { success: false, message: 'Error creating prescription' };
        }
    },

    // Update prescription (doctors only)
    async updatePrescription(prescriptionId, updateData) {
        try {
            const response = await ApiHelper.makeRequest(`/prescriptions/${prescriptionId}`, {
                method: 'PUT',
                body: JSON.stringify(updateData)
            });

            if (response.success) {
                return {
                    success: true,
                    data: response.data.prescription,
                    message: 'Prescription updated successfully'
                };
            } else {
                return { success: false, message: response.message };
            }
        } catch (error) {
            console.error('Error updating prescription:', error);
            return { success: false, message: 'Error updating prescription' };
        }
    },

    // Request prescription refill (patients only)
    async requestRefill(prescriptionId) {
        try {
            const response = await ApiHelper.makeRequest(`/prescriptions/${prescriptionId}/refill`, {
                method: 'POST'
            });

            if (response.success) {
                return {
                    success: true,
                    data: response.data,
                    message: 'Refill requested successfully'
                };
            } else {
                return { success: false, message: response.message };
            }
        } catch (error) {
            console.error('Error requesting refill:', error);
            return { success: false, message: 'Error requesting refill' };
        }
    },

    // Update prescription status
    async updatePrescriptionStatus(prescriptionId, status, notes = null) {
        try {
            const requestData = { status };
            if (notes) requestData.notes = notes;

            const response = await ApiHelper.makeRequest(`/prescriptions/${prescriptionId}/status`, {
                method: 'PUT',
                body: JSON.stringify(requestData)
            });

            if (response.success) {
                return {
                    success: true,
                    data: response.data.prescription,
                    message: 'Prescription status updated successfully'
                };
            } else {
                return { success: false, message: response.message };
            }
        } catch (error) {
            console.error('Error updating prescription status:', error);
            return { success: false, message: 'Error updating prescription status' };
        }
    },

    // Get prescriptions for specific patient (doctors only)
    async getPatientPrescriptions(patientId) {
        try {
            const response = await ApiHelper.makeRequest(`/prescriptions/patient/${patientId}`);

            if (response.success) {
                return {
                    success: true,
                    data: {
                        prescriptions: response.data.prescriptions || [],
                        patientName: response.data.patient_name
                    }
                };
            } else {
                return { success: false, message: response.message };
            }
        } catch (error) {
            console.error('Error getting patient prescriptions:', error);
            return { success: false, message: 'Error loading patient prescriptions' };
        }
    },

    // Get prescription statistics
    async getPrescriptionStats() {
        try {
            const response = await ApiHelper.makeRequest('/prescriptions/stats');

            if (response.success) {
                return {
                    success: true,
                    data: response.data.stats
                };
            } else {
                return { success: false, message: response.message };
            }
        } catch (error) {
            console.error('Error getting prescription stats:', error);
            return { success: false, message: 'Error loading prescription statistics' };
        }
    }
};

// Medical Records Utilities
const MedicalRecordsUtils = {
    // Validate medical history form data
    validateMedicalHistoryData(data) {
        const errors = [];
        
        // Height validation
        if (data.height && (data.height < 50 || data.height > 300)) {
            errors.push('الطول يجب أن يكون بين 50 و 300 سم');
        }
        
        // Weight validation
        if (data.weight && (data.weight < 10 || data.weight > 500)) {
            errors.push('الوزن يجب أن يكون بين 10 و 500 كجم');
        }
        
        // Blood type validation
        if (data.blood_type) {
            const validBloodTypes = ['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-'];
            if (!validBloodTypes.includes(data.blood_type)) {
                errors.push('فصيلة الدم غير صحيحة');
            }
        }
        
        return {
            isValid: errors.length === 0,
            errors: errors
        };
    },

    // Validate prescription data
    validatePrescriptionData(data) {
        const errors = [];
        const requiredFields = ['patient_id', 'appointment_id', 'medication_name', 'dosage', 'frequency', 'duration'];
        
        // Check required fields
        requiredFields.forEach(field => {
            if (!data[field] || data[field].toString().trim() === '') {
                errors.push(`${this.getFieldNameArabic(field)} مطلوب`);
            }
        });
        
        // Refills validation
        if (data.refills_allowed && (data.refills_allowed < 0 || data.refills_allowed > 10)) {
            errors.push('عدد مرات التجديد يجب أن يكون بين 0 و 10');
        }
        
        // Date validation
        if (data.start_date && data.end_date) {
            const startDate = new Date(data.start_date);
            const endDate = new Date(data.end_date);
            
            if (endDate <= startDate) {
                errors.push('تاريخ الانتهاء يجب أن يكون بعد تاريخ البدء');
            }
        }
        
        return {
            isValid: errors.length === 0,
            errors: errors
        };
    },

    // Get field name in Arabic
    getFieldNameArabic(field) {
        const fieldNames = {
            'patient_id': 'المريض',
            'appointment_id': 'الموعد',
            'medication_name': 'اسم الدواء',
            'dosage': 'الجرعة',
            'frequency': 'التكرار',
            'duration': 'المدة',
            'quantity': 'الكمية',
            'instructions': 'تعليمات الاستخدام',
            'notes': 'الملاحظات',
            'refills_allowed': 'عدد مرات التجديد',
            'start_date': 'تاريخ البدء',
            'end_date': 'تاريخ الانتهاء',
            'medical_history': 'التاريخ الطبي',
            'allergies': 'الحساسية',
            'current_medications': 'الأدوية الحالية',
            'chronic_conditions': 'الأمراض المزمنة',
            'family_history': 'التاريخ العائلي',
            'surgical_history': 'التاريخ الجراحي',
            'smoking_status': 'حالة التدخين',
            'alcohol_consumption': 'استهلاك الكحول',
            'exercise_frequency': 'تكرار التمارين',
            'height': 'الطول',
            'weight': 'الوزن',
            'blood_type': 'فصيلة الدم'
        };
        
        return fieldNames[field] || field;
    },

    // Calculate BMI
    calculateBMI(height, weight) {
        if (!height || !weight) return null;
        
        const heightInMeters = height / 100;
        return (weight / (heightInMeters * heightInMeters)).toFixed(1);
    },

    // Get BMI status
    getBMIStatus(bmi) {
        if (!bmi) return { class: 'bg-secondary', text: 'غير محدد', color: '#6c757d' };
        
        const bmiValue = parseFloat(bmi);
        
        if (bmiValue < 18.5) {
            return { class: 'bg-info', text: 'نقص في الوزن', color: '#0dcaf0' };
        } else if (bmiValue < 25) {
            return { class: 'bg-success', text: 'وزن طبيعي', color: '#198754' };
        } else if (bmiValue < 30) {
            return { class: 'bg-warning', text: 'زيادة في الوزن', color: '#ffc107' };
        } else {
            return { class: 'bg-danger', text: 'سمنة', color: '#dc3545' };
        }
    },

    // Format medical history for display
    formatMedicalHistoryForDisplay(medicalHistory) {
        if (!medicalHistory) return {};
        
        return {
            bloodType: medicalHistory.blood_type || 'غير محدد',
            height: medicalHistory.height ? `${medicalHistory.height} سم` : 'غير محدد',
            weight: medicalHistory.weight ? `${medicalHistory.weight} كجم` : 'غير محدد',
            bmi: this.calculateBMI(medicalHistory.height, medicalHistory.weight),
            smokingStatus: this.getSmokingStatusArabic(medicalHistory.smoking_status),
            exerciseFrequency: this.getExerciseFrequencyArabic(medicalHistory.exercise_frequency),
            alcoholConsumption: this.getAlcoholConsumptionArabic(medicalHistory.alcohol_consumption),
            allergies: medicalHistory.allergies || 'لا توجد حساسية معروفة',
            currentMedications: medicalHistory.current_medications || 'لا توجد أدوية حالية',
            chronicConditions: medicalHistory.chronic_conditions || 'لا توجد أمراض مزمنة',
            familyHistory: medicalHistory.family_history || 'لا يوجد تاريخ عائلي مرضي',
            surgicalHistory: medicalHistory.surgical_history || 'لا توجد عمليات جراحية سابقة',
            generalHistory: medicalHistory.medical_history || 'لا توجد معلومات إضافية',
            lastUpdated: medicalHistory.medical_history_last_updated ? 
                new Date(medicalHistory.medical_history_last_updated).toLocaleDateString('ar-SA') : 'لم يتم التحديث'
        };
    },

    // Format prescription for display
    formatPrescriptionForDisplay(prescription) {
        if (!prescription) return {};
        
        const createdDate = new Date(prescription.created_at);
        const startDate = prescription.start_date ? new Date(prescription.start_date) : null;
        const endDate = prescription.end_date ? new Date(prescription.end_date) : null;
        
        return {
            ...prescription,
            createdDateFormatted: createdDate.toLocaleDateString('ar-SA'),
            startDateFormatted: startDate ? startDate.toLocaleDateString('ar-SA') : null,
            endDateFormatted: endDate ? endDate.toLocaleDateString('ar-SA') : null,
            statusArabic: this.getPrescriptionStatusArabic(prescription.status),
            isExpiringSoon: endDate && endDate <= new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
            canModify: prescription.status === 'active'
        };
    },

    // Get smoking status in Arabic
    getSmokingStatusArabic(status) {
        const statuses = {
            'never': 'لم أدخن مطلقاً',
            'former': 'مدخن سابق',
            'current': 'مدخن حالياً'
        };
        return statuses[status] || 'غير محدد';
    },

    // Get exercise frequency in Arabic
    getExerciseFrequencyArabic(frequency) {
        const frequencies = {
            'rare': 'نادراً',
            'weekly': 'أسبوعياً',
            'daily': 'يومياً'
        };
        return frequencies[frequency] || 'غير محدد';
    },

    // Get alcohol consumption in Arabic
    getAlcoholConsumptionArabic(consumption) {
        const consumptions = {
            'none': 'لا أشرب',
            'occasional': 'أحياناً',
            'moderate': 'معتدل',
            'heavy': 'كثير'
        };
        return consumptions[consumption] || 'غير محدد';
    },

    // Get prescription status in Arabic
    getPrescriptionStatusArabic(status) {
        const statuses = {
            'active': 'نشط',
            'completed': 'مكتمل',
            'cancelled': 'مُلغى',
            'expired': 'منتهي الصلاحية'
        };
        return statuses[status] || status;
    },

    // Get update type info for timeline
    getUpdateTypeInfo(updateType) {
        const types = {
            'initial_registration': {
                title: 'التسجيل الأولي',
                icon: 'bi-plus-circle',
                class: 'bg-success'
            },
            'patient_self_update': {
                title: 'تحديث شخصي',
                icon: 'bi-person',
                class: 'bg-primary'
            },
            'appointment_update': {
                title: 'تحديث خلال الموعد',
                icon: 'bi-calendar-check',
                class: 'bg-info'
            },
            'doctor_update': {
                title: 'تحديث من الطبيب',
                icon: 'bi-person-badge',
                class: 'bg-warning'
            }
        };
        
        return types[updateType] || {
            title: 'تحديث',
            icon: 'bi-pencil',
            class: 'bg-secondary'
        };
    },

    // Export medical history to different formats
    exportMedicalHistory(medicalHistory, format = 'text') {
        const formatted = this.formatMedicalHistoryForDisplay(medicalHistory);
        
        switch (format) {
            case 'text':
                return this.exportToText(formatted);
            case 'json':
                return JSON.stringify(medicalHistory, null, 2);
            case 'csv':
                return this.exportToCSV(formatted);
            default:
                return this.exportToText(formatted);
        }
    },

    // Export to text format
    exportToText(formatted) {
        return `
=== التاريخ الطبي ===

المعلومات الأساسية:
- فصيلة الدم: ${formatted.bloodType}
- الطول: ${formatted.height}
- الوزن: ${formatted.weight}
- مؤشر كتلة الجسم: ${formatted.bmi || 'غير محسوب'}

نمط الحياة:
- حالة التدخين: ${formatted.smokingStatus}
- تكرار التمارين: ${formatted.exerciseFrequency}
- استهلاك الكحول: ${formatted.alcoholConsumption}

التاريخ المرضي:
- الحساسية: ${formatted.allergies}
- الأدوية الحالية: ${formatted.currentMedications}
- الأمراض المزمنة: ${formatted.chronicConditions}
- التاريخ العائلي: ${formatted.familyHistory}
- التاريخ الجراحي: ${formatted.surgicalHistory}
- معلومات إضافية: ${formatted.generalHistory}

آخر تحديث: ${formatted.lastUpdated}
        `.trim();
    },

    // Export to CSV format
    exportToCSV(formatted) {
        const data = [
            ['الحقل', 'القيمة'],
            ['فصيلة الدم', formatted.bloodType],
            ['الطول', formatted.height],
            ['الوزن', formatted.weight],
            ['مؤشر كتلة الجسم', formatted.bmi || 'غير محسوب'],
            ['حالة التدخين', formatted.smokingStatus],
            ['تكرار التمارين', formatted.exerciseFrequency],
            ['استهلاك الكحول', formatted.alcoholConsumption],
            ['الحساسية', formatted.allergies],
            ['الأدوية الحالية', formatted.currentMedications],
            ['الأمراض المزمنة', formatted.chronicConditions],
            ['التاريخ العائلي', formatted.familyHistory],
            ['التاريخ الجراحي', formatted.surgicalHistory],
            ['معلومات إضافية', formatted.generalHistory],
            ['آخر تحديث', formatted.lastUpdated]
        ];
        
        return data.map(row => 
            row.map(cell => `"${cell.replace(/"/g, '""')}"`).join(',')
        ).join('\n');
    }
};

// Make APIs available globally
window.MedicalRecordsAPI = MedicalRecordsAPI;
window.PrescriptionsAPI = PrescriptionsAPI;
window.MedicalRecordsUtils = MedicalRecordsUtils;