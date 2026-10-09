(function ($) {
	var halo = {
	    initBlogPostSlider: function() {
            var blogBlock = $('[data-blogs-slider]');

            blogBlock.each(function() {
                var self = $(this),
                    rows = self.data('rows');

                if(self.not('.slick-initialized')) {
                    self.slick({
                        slidesToShow: rows,
                        slidesToScroll: 1,
                        dots: true,
                        speed: 800,
                        autoplay: true,
                        arrows: false,
                        responsive: [
                            {
                                breakpoint: 992,
                                settings: {
                                    slidesToScroll: 2,
                                    slidesToShow: 2
                                }
                            },
                            {
                                breakpoint: 768,
                                settings: {
                                    slidesToScroll: 1,
                                    slidesToShow: 1
                                }
                            }
                        ]
                    });
                };
            });
        }
	}
	halo.initBlogPostSlider();
})(jQuery);
