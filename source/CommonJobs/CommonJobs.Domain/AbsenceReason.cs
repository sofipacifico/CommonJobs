﻿using System;
using System.Collections.Generic;
using System.Linq;
using System.Text;
using CommonJobs.Utilities;

namespace CommonJobs.Domain
{
    public class AbsenceReason
    {
        public string Id { get; private set; }
        public string Text { get; private set; }
        public string Color { get; set; }

        private AbsenceReason()
        {
            //RavenDB usage
        }

        public AbsenceReason(string text, string color)
        {
            Id = text.GenerateSlug(20);
            Text = text;
            Color = color;
        }
    }
}
