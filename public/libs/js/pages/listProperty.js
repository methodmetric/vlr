var listProperty = {
    init: function () {
        this.listForm()
    },

    listForm: function () {
        ELEMENT.locale(ELEMENT.lang.en);
        new Vue({
            el: '#list-property-form',
            data: {
                submitting: false,
                listForm: {
                    fullName: '',
                    email: '',
                    phone: '',
                    city: '',
                    type: '',
                    bedroom: '',
                    bathroom: '',
                    propertyCondition: '',
                    leaseTerm: '',
                    date: '',
                    comment: '',
                    formSource: 'list-properties',
                    leadSource: 'Organic',
                    utmSource: '',
                    utmMedium: '',
                    utmCampaign: ''
                },
                rules: {
                    fullName: [{
                        required: true,
                        message: "Please enter your name",
                        pattern: /^[a-zA-Z-,]+(\s{0,1}[a-zA-Z-, ])*$/,
                        trigger: 'blur'
                    }],
                    email: [{
                        required: true,
                        message: "Please enter your email",
                        trigger: 'blur'
                    }, {
                        type: 'email',
                        message: 'Please enter correct email address',
                        trigger: 'blur,change'
                    }],
                    city: [{
                        required: true,
                        message: "Please choose one city option",
                        trigger: 'change'
                    }],
                    type: [{
                        required: true,
                        message: "Please choose one type option",
                        trigger: 'change'
                    }],
                    bedroom: [{
                        required: true,
                        message: "Please choose one bedroom option",
                        trigger: 'change'
                    }]
                }
            },
            computed: {
                formString: function () {
                    return JSON.stringify(this.listForm);
                }
            },
            methods: {
                submit(formName) {
                    // guard against double-clicks queueing a second request/push
                    if (this.submitting) return;

                    this.$refs[formName].validate((valid) => {
                        if (valid) {
                            this.submitting = true;
                            axios.post('list-properties/new', {
                                formString: this.formString
                            })
                            .then(() => {
                                this.submitting = false;
                                $("#list-property-form form")[0].reset()
                                $("#list-property-form form .message-holder").html("Your property has been submitted, we will contact you as soon as possible.")

                                // GTM conversion tracking — this form has no thank-you page redirect.
                                // Fires only here, once per confirmed successful submission.
                                window.dataLayer = window.dataLayer || [];
                                window.dataLayer.push({
                                    'event': 'list_property_form_submit',
                                    'form_name': 'list_property_organic'
                                });
                            })
                            .catch(() => {
                                this.submitting = false;
                                $("#list-property-form form .message-holder").html("Something went wrong with your submission, please call us at 604-899-0220.")
                            })
                        } else {
                            $("#list-property-form form .message-holder").html("Something wrong, error with submission.")
                            return false;
                        }
                    });
                },

            }
        })
    }
}


$(function () {
    listProperty.init();
})
