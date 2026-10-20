var listing = {
    init: function () {
        this.floatingForm()
        this.sendData()
    },

    floatingForm: function () {
        $(function () {
            var offset = $("#sidebar").offset();
            var offsetLabel = $(".label-center").offset();
            var topPadding = 20;
            var currentMargin = 0;

            if ($(window).width() > 425) {
                $(window).scroll(function () {
                    if ($(window).scrollTop() > offset.top) {
                        currentMargin = $(window).scrollTop() - offset.top + topPadding;
                        if (currentMargin < 300) {
                            $("#sidebar").stop().animate({
                                marginTop: currentMargin
                            });
                        }
                    } else {
                        $("#sidebar").stop().animate({
                            marginTop: 0
                        });
                    };
                });

            }
        });
    },

    sendData: function () {
        ELEMENT.locale(ELEMENT.lang.en);
    }
}


$(function () {
    // listing.init();
})
