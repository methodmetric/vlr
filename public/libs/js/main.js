var main = {
    init: function () {
        if ($(window).width() > 1199 ){
            this.hoverDropDown()
        }
        this.scrollToTop()
        this.bannerChangeImage()
    },

    hoverDropDown: function () {
        $('ul.nav li.dropdown').hover(function () {
            $(this).find('.dropdown-menu').stop(true, true).delay(50).fadeIn(400);
        }, function () {
            $(this).find('.dropdown-menu').stop(true, true).delay(50).fadeOut(400);
        });
    },

    scrollToTop: function () {
        $(window).scroll(function () {
            if ($(this).scrollTop() > 500) {
                $('.backToTop').fadeIn(300);
            } else {
                $('.backToTop').fadeOut(300);
            }
        });

        $('.backToTop').click(function (event) {
            event.preventDefault();
            $('html, body').animate({
                scrollTop: 0
            }, 800);
        })
    },

    bannerChangeImage: function () {
        // var images = ['image1.jpg', 'image2.jpg', 'image3.jpg', 'image4.jpg', 'image5.jpg'];
        var images = ['homes-interior-design-pictures.jpg', 'penthouse2.jpg','4362-Stearman-Ave-WV-360hometours-14.jpg'];
        $('.backGroundImages').css({
            // 'background-image': 'url(../../img/' + images[Math.floor(Math.random() * images.length)] + ')'
            'background-image': 'url(../../new-img/' + images[Math.floor(Math.random() * images.length)] + ')'
        });
    }
}


$(function () {
    main.init();
})